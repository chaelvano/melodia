const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl =  require('@distube/ytdl-core');
const axios = require('axios');

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
                message.reply("Please join a voice channel before calling this command");
                
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
                    const response = await axios.get(`https://www.googleapis.com/youtube/v3/search`, {
                        params: {
                            part: 'snippet',
                            maxResults: 1,
                            q: argument,
                            type: 'video',
                            key: YOUTUBE_API_KEY,
                        }
                    });

                    if (response.data.items.length === 0) {
                        message.react('😓');
                        message.reply("Can't find what you're looking for");
                        
                        return;
                    }

                    const id = response.data.items[0].id.videoId;
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
                message.reply(`Added "${(await ytdl.getInfo(url)).videoDetails.title}" to queue`);
            } else {
                playAudio(message, server);
            }

            break;

        case "pause":
            
        
            break;

        case "resume":
            
        
            break;

        case "next":
            
        
            break;

        case "stop":
            
        
            break;
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
    message.reply(`Now playing "${(await ytdl.getInfo(url)).videoDetails.title}"`);

    server.player.play(resource);
}

client.login(TOKEN);