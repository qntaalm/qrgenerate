const express = require("express")
const app = express();
var listener = app.listen(process.env.PORT || 2000, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
app.listen(() => console.log("I'm Ready To Work..! 24H"));
app.get('/', (req, res) => {
  res.send(`
  <body>
  <center><h1>Bot 24H ON!</h1></center
  </body>`)
});
//====================================

const Discord = require('discord.js');
const QRCode = require('qrcode');
const { MongoClient } = require('mongodb');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// =====================================
// الإعدادات الأساسية
// =====================================

const TOKEN = process.env.token;
const CLIENT_ID = '1564977838451458088';

// ضع آيدي سيرفرك للتجربة السريعة.
// اتركه فارغًا '' لتسجيل الأمر عالميًا.
const GUILD_ID = '';

const MONGO_URI = process.env.mongodb;
const DATABASE_NAME = 'QRBot';

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

let db;
let settingsCollection;
let warningsCollection;

async function connectMongo() {
    await mongoClient.connect();

    db = mongoClient.db(DATABASE_NAME);

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

    console.log('✅ Connected to MongoDB');
}

// =====================================
// تعريف Slash Command
// =====================================

const commands = [
    {
        name: 'set',
        description: 'تحديد رومات تحويل الروابط إلى QR Code',
        options: [
            {
                name: 'channel_id',
                description: 'ايدي الروم',
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

// =====================================
// تسجيل Slash Commands
// =====================================

async function registerCommands() {
    const rest = new REST({ version: '9' }).setToken(TOKEN);

    const route = GUILD_ID
        ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
        : Routes.applicationCommands(CLIENT_ID);

    await rest.put(route, {
        body: commands
    });

    console.log('✅ Slash commands registered');
}

// =====================================
// عند تشغيل البوت
// =====================================

client.once('ready', () => {
    console.log(`✅ Bot online: ${client.user.tag}`);
});

// =====================================
// أمر /set
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
            content: '❌ تحتاج إلى صلاحية إدارة السيرفر.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const optionNames = [
            'channel_id',
            'channel_id2',
            'channel_id3',
            'channel_id4',
            'channel_id5'
        ];

        const channels = optionNames
            .map(name => interaction.options.getChannel(name))
            .filter(Boolean);

        // التحقق من الرومات المختارة
        for (const channel of channels) {
            if (
                !channel.guild ||
                channel.guild.id !== interaction.guildId ||
                !channel.isText()
            ) {
                return interaction.editReply(
                    '❌ يجب اختيار رومات نصية من نفس السيرفر.'
                );
            }
        }

        // إزالة التكرار
        const channelIds = [
            ...new Set(channels.map(channel => channel.id))
        ];

        // حفظ الإعدادات الخاصة بالسيرفر
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
            .setTitle('✅ تم إعداد رومات QR Code')
            .setDescription(
                channelIds
                    .map((id, index) => `${index + 1}. <#${id}>`)
                    .join('\n')
            )
            .setFooter({
                text: `عدد الرومات: ${channelIds.length}/5`
            });

        await interaction.editReply({
            embeds: [embed]
        });

    } catch (error) {
        console.error('Slash command error:', error);

        await interaction.editReply(
            '❌ حدث خطأ أثناء حفظ إعدادات الرومات.'
        ).catch(() => null);
    }
});

// =====================================
// استخراج الرابط
// =====================================

function extractURL(content) {
    const regex = /https?:\/\/[^\s<>]+/i;
    const match = content.match(regex);

    if (!match) return null;

    const url = match[0].replace(/[.,!?;:]+$/, '');

    try {
        const parsed = new URL(url);

        if (
            parsed.protocol !== 'http:' &&
            parsed.protocol !== 'https:'
        ) {
            return null;
        }

        return url;
    } catch {
        return null;
    }
}

// =====================================
// معالجة الرسائل في الرومات المحددة
// =====================================

client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;

    try {
        // جلب إعدادات هذا السيرفر فقط
        const settings = await settingsCollection.findOne({
            guildId: message.guild.id
        });

        if (!settings || !settings.channelIds.includes(message.channel.id)) {
            return;
        }

        // تجاهل أوامر البوت القديمة
        if (message.content.trim().startsWith('+')) return;

        const url = extractURL(message.content);

        // =================================
        // رسالة بدون رابط
        // =================================

        if (!url) {
            // حذف الرسالة
            await message.delete().catch(error => {
                console.error('Message delete error:', error.message);
            });

            // تسجيل المخالفة في MongoDB
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

            // من المخالفة الثانية فصاعدًا
            if (count >= 2) {
                try {
                    await message.author.send(
                        `⚠️ تم حذف رسالتك في سيرفر **${message.guild.name}**.\n\n` +
                        'هذا الروم مخصص للروابط فقط لتحويلها إلى QR Code.\n' +
                        'ممنوع إرسال نصوص أو صور أو رسائل بدون رابط.\n\n' +
                        'يرجى إرسال رابط صالح فقط.'
                    );
                } catch {
                    console.log(
                        `تعذر إرسال رسالة خاصة إلى ${message.author.tag}`
                    );
                }
            }

            return;
        }

        // =================================
        // إنشاء QR Code
        // =================================

        const qrBuffer = await QRCode.toBuffer(url, {
            width: 800,
            margin: 2,
            errorCorrectionLevel: 'H'
        });

        const attachment = new Discord.MessageAttachment(
            qrBuffer,
            'qrcode.png'
        );

        const embed = new Discord.MessageEmbed()
            .setColor('#2ECC71')
            .setTitle('📱 QR Code')
            .setDescription('امسح الكود بكاميرا هاتفك لفتح الرابط.')
            .setImage('attachment://qrcode.png')
            .addField(
                '🔗 الرابط',
                url.length > 1024
                    ? url.slice(0, 1021) + '...'
                    : url
            )
            .setFooter({
                text: 'QR Code Generator'
            });

        await message.reply({
            embeds: [embed],
            files: [attachment],
            allowedMentions: {
                repliedUser: false
            }
        });

    } catch (error) {
        console.error('Message handler error:', error);
    }
});

// =====================================
// تشغيل البوت
// =====================================

(async () => {
    try {
        await connectMongo();
        await registerCommands();
        await client.login(TOKEN);

    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
})();
