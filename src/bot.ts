import { Client, CommandInteraction, GuildMember, Interaction, MessageActionRow, MessageButton, MessageEmbed, MessageReaction, TextBasedChannels, User } from "discord.js";
import { FeedTarget, ModeratedFeedBotConfig } from "./utils/config";
import { Routes, Snowflake } from "discord-api-types/v9";
import Snoowrap, { Submission } from "snoowrap";
import { baseUrl, userAgent } from "./utils/constants";
import { commands, inviteCommand } from "./utils/commands";
import { intents, partials, permissions, scopes } from "./utils/permissions";

import { REST } from "@discordjs/rest";
import { SubmissionStream } from "snoostorm";
import discordEscape from "discord-escape";
import { log } from "./utils/debug";

export class ModeratedFeedBot {
	private readonly config: ModeratedFeedBotConfig;
	private readonly targetsByChannel: Record<Snowflake, FeedTarget>;
	private started = false;
	private client: Client;
	private snoowrap: Snoowrap;
	private minimumPostTimestamp: number;

	constructor(config: ModeratedFeedBotConfig) {
		this.config = config;
		this.validateConfig();

		this.targetsByChannel = Object.fromEntries(this.config.targets.map(target => {
			return [
				target.channel,
				target,
			];
		}));

		this.onReactionAdd = this.onReactionAdd.bind(this);
		this.onInteractionCreate = this.onInteractionCreate.bind(this);
	}

	private validateConfig(): void {
		if (typeof this.config.token === "undefined" || this.config.token === null) {
			throw new TypeError("Token must be provided");
		} else if (typeof this.config.token !== "string") {
			throw new TypeError("Token must be a string");
		} else if (this.config.token === "") {
			throw new TypeError("Token must not be empty");
		}
	}

	async start(): Promise<void> {
		if (this.started) {
			throw new Error("Already started");
		}
		this.started = true;

		this.client = new Client({
			intents,
			partials,
		});

		log("discord client logging in");
		await this.client.login(this.config.token);
		log("discord client logged in");

		if (this.config.registerCommands) {
			this.registerCommands();
		}

		this.snoowrap = new Snoowrap({
			...this.config.snoowrap,
			userAgent,
		});
		this.minimumPostTimestamp = Date.now();

		for (const target of this.config.targets) {
			const channel = await this.client.channels.fetch(target.channel);
			if (channel === null || !channel.isText()) {
				if (target.key) {
					log("failed to find text channel with id '%s' for target '%s'", target.channel, target.key);
				} else {
					log("failed to find text channel with id '%s'", target.channel);
				}
				continue;
			}

			const stream = new SubmissionStream(this.snoowrap, {
				limit: this.config.poll.limit,
				pollTime: this.config.poll.interval,
				subreddit: target.subreddit,
			});
			stream.on("item", submission => {
				this.handleSubmission(channel, submission);
			});
		}

		this.client.on("messageReactionAdd", this.onReactionAdd);
		this.client.on("interactionCreate", this.onInteractionCreate);
	}

	private async registerCommands(): Promise<void> {
		const rest = new REST({
			version: "9",
		}).setToken(this.config.token);

		log("discord client registering commands");
		await rest.put(Routes.applicationCommands(this.client.user.id), {
			body: commands.map(command => command.toJSON()),
		});
		log("discord client registered commands");
	}

	private async handleSubmission(channel: TextBasedChannels, submission: Submission): Promise<void> {
		try {
			// Prevent removed submissions from being handled
			if (submission.spam || submission.removed_by_category !== null) return;

			// Prevent submissions posted before the bot started from being handled
			const timestamp = submission.created_utc * 1000;
			if (timestamp < this.minimumPostTimestamp) return;

			const embed = new MessageEmbed()
				.setTitle(submission.title.slice(0, 256))
				.setURL(baseUrl + submission.permalink)
				.setTimestamp(timestamp);

			if (submission.link_flair_text && typeof submission.link_flair_background_color === "string") {
				const color = parseInt(submission.link_flair_background_color.slice(1), 16);
				if (!isNaN(color)) {
					embed.setColor(color);
				}
			}

			const image = submission.is_reddit_media_domain && submission.domain === "i.redd.it";

			if (!image && submission.thumbnail !== "self") {
				embed.setThumbnail(submission.thumbnail);
			}

			if (image) {
				embed.setImage(submission.url);
			} else if (submission.is_self) {
				embed.setDescription(submission.selftext.slice(0, 4096));
			} else if (submission.url) {
				const domain = discordEscape(submission.domain).slice(0, 90);
				const url = discordEscape(submission.url).slice(0, 4000);

				embed.setDescription("[`" + domain + "`](" + url + ")");
			}

			if (submission.author) {
				const iconUrl = (await submission.author.icon_img).split("?")[0];
				const url = baseUrl + "/u/" + submission.author.name;

				embed.setAuthor(submission.author.name, iconUrl, url);
			}

			await channel.send({
				embeds: [
					embed,
				],
			});
		} catch (error) {
			log("failed to handle submission: %O", error);
		}
	}

	private async onReactionAdd(reaction: MessageReaction, user: User): Promise<void> {
		try {
			if (reaction.partial) {
				try {
					reaction = await reaction.fetch();
				} catch {
					log("failed to fetch partial reaction");
					return;
				}
			}

			// Ensure the emoji has an assigned removal reason
			const emoji = reaction.emoji.id || reaction.emoji.name;
			const removalReason = this.config.moderation.emoji[emoji];
			if (!removalReason) return;

			let message = reaction.message;
			if (message.partial) {
				try {
					message = await message.fetch();
				} catch {
					log("failed to fetch partial message");
					return;
				}
			}

			// Ensure the message is in a target channel
			const target = this.targetsByChannel[message.channelId];
			if (!target) return;
			log("received '%s' reaction in target channel for r/%s", emoji, target.subreddit);

			// Ensure the member can moderate
			const member = await message.guild.members.fetch(user);
			if (!this.hasModerationRole(member)) return;

			const embed = message.embeds[0];
			if (!embed || !embed.url) return;

			const submissionId = embed.url.split("/")[6];
			if (!submissionId) return;

			const submission = this.snoowrap.getSubmission(submissionId);
			if (!submission) return;

			try {
				await Promise.all([
					submission.report({
						reason: this.formatRemovalReason(removalReason, target, member),
					}),
					submission.remove({
						spam: removalReason.toLowerCase().includes("spam"),
					}),
				]);
			} catch {
				log("failed to report or remove submission with id '%s'", submissionId);
				return;
			}

			// Delete message and remove reaction to indicate success
			try {
				await message.delete();
			} catch {
				log("failed to delete message for submission with id '%s'", submissionId);
			}
			try {
				await reaction.remove();
			} catch {
				log("failed to remove reaction for submission with id '%s'", submissionId);
			}
		} catch (error) {
			log("failed to handle reaction add: %O", error);
		}
	}

	private hasModerationRole(member: GuildMember): boolean {
		return member.roles.cache.some(role => {
			return this.config.moderation.roles.includes(role.id);
		});
	}

	private formatRemovalReason(removalReason: string, target: FeedTarget, member: GuildMember): string {
		return removalReason
			.replace(/{USER_TAG}/g, member.user.tag)
			.replace(/{USER_ID}/g, member.user.id)
			.replace(/{KEY}/g, target.key);
	}

	private async onInteractionCreate(interaction: Interaction): Promise<void> {
		if (!interaction.isCommand()) return;

		try {
			if (interaction.commandName === inviteCommand) {
				await this.executeInviteCommand(interaction);
			}
		} catch (error) {
			log("interaction with command '%s' failed: %O", interaction.commandName, error);
		}
	}

	private async executeInviteCommand(interaction: CommandInteraction): Promise<void> {
		const invite = this.client.generateInvite({
			permissions,
			scopes,
		});

		const button = new MessageButton()
			.setLabel("Invite")
			.setStyle("LINK")
			.setURL(invite);

		await interaction.reply({
			components: [
				new MessageActionRow().addComponents(button),
			],
			content: "Invite the bot using the following link:",
			ephemeral: true,
		});
	}
}
