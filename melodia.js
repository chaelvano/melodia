const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');

const TOKEN = process.env.TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});
const servers = new Map();
const prefix = "/melodia";

client.once('ready', () => {
    client.user.setActivity('/melodia help', {
        type: 'LISTENING',
    });
});

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(prefix)) return;

    const messageContent = message.content.slice(prefix.length).trim().split(/ +/);
    const command = messageContent.shift().toLowerCase();
    const argument = messageContent.join(' ');
    let server = servers.get(message.guild.id);

    if (!server) {
        server = {
            connection: null,
            player: createAudioPlayer(),
            queue: [],
        };

        server.player.on(AudioPlayerStatus.Idle, () => {
            server.queue.shift();

            if (server.queue.length === 0) {
                if (server.connection) {
                    message.channel.send(`Disconnected from **${message.member.voice.channel.name}**`);

                    server.connection.disconnect();
                    server.connection = null;
                }
            } else {
                playAudio(message, server);
            }
        });

        servers.set(message.guild.id, server);
    }

    switch (command) {
        case "play":
            if (!message.member.voice.channel) {
                message.react('😓');
                message.reply(`Please join a voice channel before calling \`/melodia play\``);
                
                return;
            }

            if (!server.connection) {
                server.connection = joinVoiceChannel({
                    guildId: message.guild.id,
                    channelId: message.member.voice.channel.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });

                server.connection.subscribe(server.player);
            }

            let url;

            if (ytdl.validateURL(argument)) {
                url = argument;
            } else {
                try {
                    const result = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(argument)}&type=video&key=${YOUTUBE_API_KEY}`)).json();

                    if (result.data.items.length === 0) {
                        message.react('😓');
                        message.reply(`Can't find what you're looking for. Please try another query`);
                        
                        return;
                    }

                    const id = result.data.items[0].id.videoId;
                    url = `https://www.youtube.com/watch?v=${id}`;
                } catch (error) {
                    message.react('😓');
                    message.reply(`Uh oh! ${error.message}`);

                    return;
                }
            }

            server.queue.push(url);

            if (server.queue.length > 1) {
                message.react('👌');
                message.reply(`Added "**${(await ytdl.getInfo(url)).videoDetails.title}**" to queue`);
            } else {
                playAudio(message, server);
            }

            break;

        case "pause":
            if (!server.connection) {
                message.react('😓');
                message.reply(`I'm not in any voice channel at the moment`);

                return;
            }

            if (server.player.state.status === AudioPlayerStatus.Playing) {
                message.react('👌');
                message.reply(`"**${(await ytdl.getInfo(server.queue[0])).videoDetails.title}**" has been paused`);
                
                server.player.pause();
            } else {
                message.react('😓');
                message.reply(`Playback is already paused`);
            }
        
            break;

        case "resume":
            if (!server.connection) {
                message.react('😓');
                message.reply(`I'm not in any voice channel at the moment`);

                return;
            }

            if (server.player.state.status === AudioPlayerStatus.Paused) {
                message.react('👌');
                message.reply(`"**${(await ytdl.getInfo(server.queue[0])).videoDetails.title}**" has been resumed`);
                
                server.player.unpause();
            } else {
                message.react('😓');
                message.reply(`Playback is already playing`);
            }
        
            break;

        case "next":
            if (!server.connection) {
                message.react('😓');
                message.reply(`I'm not in any voice channel at the moment`);

                return;
            }

            const skipCount = parseInt(argument) > 1 ? parseInt(argument) : 1;

            message.react('👌');
            message.reply(`Skipped ${skipCount} item(s) from queue`);

            server.queue.splice(0, skipCount);
            server.player.stop();
        
            break;

        case "stop":
            if (!server.connection) {
                message.react('😓');
                message.reply(`I'm not in any voice channel at the moment`);

                return;
            }

            message.react('👌');
            message.reply(`Playback has been stopped and queue has been cleared`);

            server.queue = [];
            server.player.stop();
        
            break;

        case "queue":
            if (!server.connection) {
                message.react('😓');
                message.reply(`I'm not in any voice channel at the moment`);

                return;
            }

            const currentTitle = (await ytdl.getInfo(server.queue[0])).videoDetails.title;
            const queueTitles = await Promise.all(server.queue.slice(1).map(async (url) => {
                const title = (await ytdl.getInfo(url)).videoDetails.title;

                return title
            }));
            const queue = queueTitles.map((title, index) => `> ${index + 1}. **${title}**`).join('\n');

            message.react('👌');
            message.reply(`Currently playing: **${currentTitle}** \n\nQueue: \n${queue || "*Queue is currently empty*"}`);

            break;

        case "help":
            message.react('👌');
            message.reply(`**Melodia command list:** \n\n\`/melodia play [query]\`: Search YouTube and play the first result \n\`/melodia pause\`: Pause the playback \n\`/melodia resume\`: Resume the playback \n\`/melodia next [number of skips]\`: Skip to the next few songs (default: 1) \n\`/melodia stop\`: Stop the playback, clear the queue, and disconnect from the voice channel \n\`/melodia queue\`: View the queue \n\n*Thank you for using Melodia!* **^_^**`);

            break;

        default:
            message.react('😓');
            message.reply(`I'm not sure what you'd like me to do. Please call \`/melodia help\` to view the available commands`);
    }
});

async function playAudio(message, server) {
    if (server.queue.length === 0) {
        if (server.connection) {
            server.connection.disconnect();
            server.connection = null;
        }

        return;
    }

    const url = server.queue[0];
    const resource = createAudioResource(ytdl(url, {
        filter: 'audioonly',
    }));

    message.react('👌');
    message.channel.send(`Now playing "${(await ytdl.getInfo(url)).videoDetails.title}"`);

    server.player.play(resource);
}

client.login(TOKEN);