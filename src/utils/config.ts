import { SnoowrapOptions } from "snoowrap";
import { Snowflake } from "discord.js";
import { configurationLog } from "./debug";
import { cosmiconfig } from "cosmiconfig";
import mergeDeep from "merge-deep";

interface ModerationOptions {
	/**
	 * A record mapping emojis to removal reasons.
	 */
	emoji: Record<string, string>;
	roles: Snowflake[];
}

interface PollOptions {
	interval?: number;
	limit?: number;
}

export interface FeedTarget {
	channel: Snowflake;
	key?: string;
	subreddit: string;
}

export interface ModeratedFeedBotConfig {
	moderation: ModerationOptions;
	poll: PollOptions;
	registerCommands: boolean;
	snoowrap: Omit<SnoowrapOptions, "userAgent">;
	targets: FeedTarget[];
	token: string;
}

const baseConfig: ModeratedFeedBotConfig = {
	moderation: {
		emoji: {
			"❌": "Removed from Discord by {USER_TAG} ({USER_ID})",
		},
		roles: [],
	},
	poll: {},
	registerCommands: false,
	snoowrap: {},
	targets: [],
	token: undefined,
};

/**
 * Gets the user-defined configuration with default values.
 * @returns The configuration object.
 */
export async function getConfig(): Promise<ModeratedFeedBotConfig> {
	const explorer = cosmiconfig("moderatedfeedbot", {
		searchPlaces: [
			"package.json",
			"config.json",
			".moderatedfeedbotrc",
			".moderatedfeedbotrc.json",
			".moderatedfeedbotrc.yaml",
			".moderatedfeedbotrc.yml",
			".moderatedfeedbotrc.js",
			".moderatedfeedbotrc.cjs",
			"moderatedfeedbot.config.js",
			"moderatedfeedbot.config.cjs",
		],
	});

	const result = mergeDeep({
		config: baseConfig,
	}, await explorer.search());

	const token = result.config.token;
	delete result.config.token;

	configurationLog("loaded configuration from '%s'", result.filepath);
	configurationLog("loaded configuration: %O", result.config);

	result.config.token = token;
	return result.config;
}
