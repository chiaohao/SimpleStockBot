import { Client, Events, GatewayIntentBits, TextChannel } from "discord.js";

export interface IBot {
    send(msg : string) : Promise<void>;
}

export class DiscordBot implements IBot{
    private readonly _client : Client;
    private readonly _channelId : string;

    public static async Create(
        token : string,
        channelId : string
    ) : Promise<IBot> {
        const client = new Client({ 
            intents: [
                GatewayIntentBits.DirectMessages,
            ],
        });

        client.once(Events.ClientReady, async readyClient => {
            console.log(`Ready! Logged in as ${readyClient.user.tag}`);
            const channel = await readyClient.channels.fetch(channelId) as TextChannel;
            channel.send('Bot On');
        });

        await client.login(token);
        return new DiscordBot(
            client,
            channelId
        );
    }

    private constructor(
        client : Client,
        channelId : string
    ) {
        this._client = client;
        this._channelId = channelId;
    };

    public async send(msg : string) : Promise<void> {
        const channel = await this._client.channels.fetch(this._channelId) as TextChannel;
        channel.send(msg);
    }
};