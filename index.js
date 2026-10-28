
const express = require('express');
const app = express();

const Discord = require('discord.js');
const QRCode = require('qrcode');
const { MongoClient } = require('mongodb');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// =====================================
// تشغيل Web Server للاستضافة
// =====================================

app.get('/', (req, res) => {
    res.send('<h1>QR Code Bot is Online!</h1>');
});

app.listen(process.env.PORT || 2000, () => {
    console.log('✅ Web server is running');
});

// =====================================
// الإعدادات
// =====================================

const TOKEN = process.env.token;
const CLIENT_ID = '1564977838451458088';
const GUILD_ID = '';
const MONGO_URI = process.env.mongodb;
const DATABASE_NAME = 'QRBot';

// نطاقات المواقع الإباحية المحظورة
// أضف أي نطاقات أخرى تريد حظرها
const BLOCKED_DOMAINS = [
    'pornhub.com',
    'xvideos.com',
    'xnxx.com',
    'xhamster.com',
    'redtube.com',
    'youporn.com',
    'tube8.com',
    'spankbang.com',
    'chaturbate.com',
    'onlyfans.com',
    'rule34.xxx',
    'eporner.com',
    'nhentai.net',
    'hentaihaven.xxx',
    'sex.com',
    'xhamster.desi',
    'porn.com',
    'beeg.com',
    'tnaflix.com',
    'motherless.com',
    'fapello.com'
];

// =====================================
// إنشاء البوت
// =====================================

const client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.DIRECT_MESSAGES,
        Discord.Intents.FLAGS.MESSAGE_CONTENT
    ],
    partials: ['CHANNEL']
});

// =====================================
// MongoDB
// =====================================

const mongoClient = new MongoClient(MONGO_URI);

let settingsCollection;
let warningsCollection;

async function connectMongo() {
    await mongoClient.connect();

    const db = mongoClient.db(DATABASE_NAME);

    settingsCollection = db.collection('guild_settings');
    warningsCollection = db.collection('qr_warnings');

    await settingsCollection.createIndex(
        { guildId: 1 },
        { unique: true }
    );

    await warningsCollection.createIndex(
        { guildId: 1, userId: 1 },
        { unique: true }
    );

    console.log('✅ MongoDB connected');
}

// =====================================
// Slash Command: /set
// =====================================

const commands = [
    {
        name: 'set',
        description: 'تحديد رومات تحويل الروابط إلى QR Code',
        options: [
            {
                name: 'channel_id',
                description: 'الروم الأول - إجباري',
                type: 7,
                required: true,
                channel_types: [0]
            },
            {
                name: 'channel_id2',
                description: 'الروم الثاني - اختياري',
                type: 7,
                required: false,
                channel_types: [0]
            },
            {
                name: 'channel_id3',
                description: 'الروم الثالث - اختياري',
                type: 7,
                required: false,
                channel_types: [0]
            },
            {
                name: 'channel_id4',
                description: 'الروم الرابع - اختياري',
                type: 7,
                required: false,
                channel_types: [0]
            },
            {
                name: 'channel_id5',
                description: 'الروم الخامس - اختياري',
                type: 7,
                required: false,
                channel_types: [0]
            }
        ]
    }
];

async function registerCommands() {
    const rest = new REST({ version: '9' }).setToken(TOKEN);

    const route = GUILD_ID
        ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
        : Routes.applicationCommands(CLIENT_ID);

    await rest.put(route, { body: commands });

    console.log('✅ Slash commands registered');
}

// =====================================
// تشغيل البوت
// =====================================

client.once('ready', () => {
    console.log(`✅ Bot online: ${client.user.tag}`);
});

// =====================================
// تنفيذ /set
// =====================================

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    if (interaction.commandName !== 'set') return;

    if (!interaction.guild) {
        return interaction.reply({
            content: '❌ هذا الأمر يعمل داخل السيرفر فقط.',
            ephemeral: true
        });
    }

    if (!interaction.memberPermissions.has('MANAGE_GUILD')) {
        return interaction.reply({
            content: '❌ تحتاج صلاحية إدارة السيرفر.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const names = [
            'channel_id',
            'channel_id2',
            'channel_id3',
            'channel_id4',
            'channel_id5'
        ];

        const channels = names
            .map(name => interaction.options.getChannel(name))
            .filter(Boolean);

        for (const channel of channels) {
            if (
                !channel.guild ||
                channel.guild.id !== interaction.guildId ||
                !channel.isText()
            ) {
                return interaction.editReply(
                    '❌ اختر رومات نصية من نفس السيرفر.'
                );
            }
        }

        const channelIds = [
            ...new Set(channels.map(channel => channel.id))
        ];

        await settingsCollection.updateOne(
            { guildId: interaction.guildId },
            {
                $set: {
                    channelIds,
                    updatedBy: interaction.user.id,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        const embed = new Discord.MessageEmbed()
            .setColor('#2ECC71')
            .setTitle('✅ تم تعيين الرومات')
            .setDescription(
                channelIds
                    .map((id, index) => `${index + 1}. <#${id}>`)
                    .join('\n')
            )
            .setFooter({
                text: `عدد الرومات: ${channelIds.length}/5`
            });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Set error:', error);

        await interaction.editReply(
            '❌ حدث خطأ أثناء حفظ الإعدادات.'
        ).catch(() => null);
    }
});

// =====================================
// استخراج الرابط والتحقق منه
// =====================================

function extractURL(content) {
    const match = content.match(/https?:\/\/[^\s<>]+/i);

    if (!match) return null;

    const url = match[0].replace(/[.,!?;:]+$/, '');

    try {
        const parsed = new URL(url);

        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return null;
        }

        return {
            url,
            hostname: parsed.hostname.toLowerCase()
                .replace(/^www\./, '')
        };

    } catch {
        return null;
    }
}

// =====================================
// فحص المواقع الإباحية
// =====================================

function isBlockedDomain(hostname) {
    return BLOCKED_DOMAINS.some(domain =>
        hostname === domain ||
        hostname.endsWith('.' + domain)
    );
}

// =====================================
// نظام الرسائل و QR Code
// =====================================

client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;

    try {
        const settings = await settingsCollection.findOne({
            guildId: message.guild.id
        });

        if (
            !settings ||
            !settings.channelIds.includes(message.channel.id)
        ) {
            return;
        }

        // تجاهل أوامر البريفكس القديمة
        if (message.content.trim().startsWith('+')) return;

        const result = extractURL(message.content);

        // =================================
        // رسالة بدون رابط
        // =================================

        if (!result) {
            await message.delete().catch(() => null);

            const warning = await warningsCollection.findOneAndUpdate(
                {
                    guildId: message.guild.id,
                    userId: message.author.id
                },
                {
                    $inc: { count: 1 },
                    $set: { updatedAt: new Date() }
                },
                {
                    upsert: true,
                    returnDocument: 'after'
                }
            );

            const count = warning?.count ?? 1;

            if (count >= 2) {
                try {
                    await message.author.send(
                        `⚠️ تم حذف رسالتك في سيرفر **${message.guild.name}**.\n\n` +
                        'هذا الروم مخصص لإرسال الروابط فقط لتحويلها إلى QR Code.\n' +
                        'يرجى عدم إرسال رسائل أخرى بدون رابط.'
                    );
                } catch {
                    console.log('تعذر إرسال التنبيه الخاص.');
                }
            }

            return;
        }

        // =================================
        // حظر المواقع الإباحية
        // =================================

        if (isBlockedDomain(result.hostname)) {
            await message.delete().catch(() => null);

            try {
                await message.author.send(
                    `🚫 تم حذف الرابط الذي أرسلته في سيرفر **${message.guild.name}**.\n\n` +
                    'هذا البوت لا يسمح بتحويل الروابط من المواقع المحظورة.'
                );
            } catch {
                console.log('تعذر إرسال تنبيه حظر الرابط.');
            }

            return;
        }

        // =================================
        // إنشاء QR Code
        // =================================

        const qrBuffer = await QRCode.toBuffer(result.url, {
            width: 800,
            margin: 2,
            errorCorrectionLevel: 'H'
        });

        const attachment = new Discord.MessageAttachment(
            qrBuffer,
            'qrcode.png'
        );

        // اسم الشخص الذي أرسل الرابط
        const displayName =
            message.member?.displayName || message.author.username;

        // الصورة الشخصية للبوت في التذييل
        const botAvatar = client.user.displayAvatarURL({
            dynamic: true,
            size: 128
        });

        const embed = new Discord.MessageEmbed()
            .setColor('#2ECC71')
            .setTitle(`📱 QR Code - ${displayName}`.slice(0, 256))
            .setImage('attachment://qrcode.png')
            .setFooter({
                text: 'QR Code Generator',
                iconURL: botAvatar
            });

        // إرسال الصورة أولًا للحصول على رابط ملفها
        const sentMessage = await message.reply({
            embeds: [embed],
            files: [attachment],
            allowedMentions: {
                repliedUser: false
            }
        });

        // =================================
        // زر تنزيل الصورة
        // =================================

        const uploadedImage = sentMessage.attachments.first();

        if (uploadedImage) {
            const downloadButton = new Discord.MessageButton()
                .setLabel('تنزيل الصورة')
                .setEmoji('📥')
                .setStyle('LINK')
                .setURL(uploadedImage.url);

            const row = new Discord.MessageActionRow()
                .addComponents(downloadButton);

            await sentMessage.edit({
                components: [row]
            }).catch(error => {
                console.error('Button error:', error.message);
            });
        }

        // حذف الرابط الأصلي بعد نجاح إرسال QR
        await message.delete().catch(error => {
            console.error('Original message delete error:', error.message);
        });

    } catch (error) {
        console.error('QR system error:', error);
    }
});

// =====================================
// تسجيل الدخول
// =====================================

(async () => {
    try {
        if (!TOKEN || !MONGO_URI) {
            throw new Error(
                'تأكد من ضبط متغيرات البيئة token و mongodb.'
            );
        }

        await connectMongo();
        await registerCommands();
        await client.login(TOKEN);

    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
})();
