require('dotenv').config();
const mongoose = require('mongoose');
const {
  Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
  ChannelType
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ─────────────────────────────────────────
//  PERSISTENCIA EN MONGODB (mongoose)
// ─────────────────────────────────────────
let db;

async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI, {
    ssl: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 10000,
  });
  db = mongoose.connection.db;
  console.log('✅ Connected to MongoDB');
}

async function loadData() {
  try {
    const doc = await db.collection('data').findOne({ _id: 'gamedata' });
    if (doc) return { leaderboard: doc.leaderboard || {}, bestTimes: doc.bestTimes || {} };
  } catch (e) { console.error('Failed to load from MongoDB:', e); }
  return { leaderboard: {}, bestTimes: {} };
}

async function saveData() {
  try {
    await db.collection('data').updateOne(
      { _id: 'gamedata' },
      { $set: { leaderboard, bestTimes } },
      { upsert: true }
    );
  } catch (e) { console.error('Failed to save to MongoDB:', e); }
}

// ─────────────────────────────────────────
//  DATOS DE POPPY PLAYTIME
// ─────────────────────────────────────────
const CHAPTERS = {
  1: {
    name: "Chapter 1: A Tight Squeeze",
    categories: [
      "Any% - Any Tapes",
      "Any% - All Tapes",
      "No Major Glitches - Any Tapes",
      "No Major Glitches - All Tapes",
    ]
  },
  2: {
    name: "Chapter 2: Fly in a Web",
    categories: [
      "Any% - OOB",
      "Any% - Inbounds",
      "Any% - NMS",
      "All Minigames - OOB",
      "All Minigames - Inbounds",
      "All Minigames - NMS",
    ]
  },
  3: {
    name: "Chapter 3: Deep Sleep",
    categories: [
      "Any% - Unrestricted",
      "Any% - OOB",
      "Any% - Inbounds",
      "Any% - NMS",
    ]
  },
  4: {
    name: "Chapter 4: Safe Haven",
    categories: [
      "Any% - Unrestricted",
      "Any% - OOB",
      "Any% - Inbounds",
      "Any% - NMS",
    ]
  },
  5: {
    name: "Chapter 5: Broken Things",
    categories: [
      "Any% - Unrestricted",
      "Any% - OOB",
      "Any% - Inbounds",
      "Any% - NMS",
    ]
  }
};

// ─────────────────────────────────────────
//  ESTADO (persistente)
// ─────────────────────────────────────────
// Se carga desde MongoDB al arrancar — ver bloque de inicio abajo
let leaderboard = {};
let bestTimes = {};

// Estado en memoria (no necesita persistencia)
const matchmaking = {};
const activeMatches = {};

const MODES = {
  "1v1":           { slots: 2, label: "1v1",           emoji: "⚔️" },
  "1v1v1":         { slots: 3, label: "1v1v1",         emoji: "🔺" },
  "1v1v1v1":       { slots: 4, label: "1v1v1v1",       emoji: "🟥" },
  "1v1v1v1v1":     { slots: 5, label: "1v1v1v1v1",     emoji: "⭐" },
  "1v1v1v1v1v1":   { slots: 6, label: "1v1v1v1v1v1",   emoji: "🔥" },
};

// ─────────────────────────────────────────
//  SISTEMA DE BANS
// ─────────────────────────────────────────
const CATEGORY_POOL = [
  { id: "c1_1", label: "Ch1 — Any% Any Tapes",         chapter: 1 },
  { id: "c1_2", label: "Ch1 — Any% All Tapes",         chapter: 1 },
  { id: "c1_3", label: "Ch1 — NMG Any Tapes",          chapter: 1 },
  { id: "c1_4", label: "Ch1 — NMG All Tapes",          chapter: 1 },
  { id: "c2_1", label: "Ch2 — Any% OOB",               chapter: 2 },
  { id: "c2_2", label: "Ch2 — Any% Inbounds",          chapter: 2 },
  { id: "c2_3", label: "Ch2 — Any% NMS",               chapter: 2 },
  { id: "c2_4", label: "Ch2 — All Minigames OOB",      chapter: 2 },
  { id: "c2_5", label: "Ch2 — All Minigames Inbounds", chapter: 2 },
  { id: "c2_6", label: "Ch2 — All Minigames NMS",      chapter: 2 },
  { id: "c3_1", label: "Ch3 — Any% OOB",               chapter: 3 },
  { id: "c3_2", label: "Ch3 — Any% Inbounds",          chapter: 3 },
  { id: "c3_3", label: "Ch3 — Any% NMS",               chapter: 3 },
  { id: "c4_1", label: "Ch4 — Any% OOB",               chapter: 4 },
  { id: "c4_2", label: "Ch4 — Any% Inbounds",          chapter: 4 },
  { id: "c4_3", label: "Ch4 — Any% NMS",               chapter: 4 },
  { id: "c5_1", label: "Ch5 — Any% OOB",               chapter: 5 },
  { id: "c5_2", label: "Ch5 — Any% Inbounds",          chapter: 5 },
  { id: "c5_3", label: "Ch5 — Any% NMS",               chapter: 5 },
];

// Ban orders per mode — always 6 bans (player index: 0-based)
const BAN_ORDERS = {
  "1v1":           [0, 1, 1, 0, 0, 1],      // A B B A A B
  "1v1v1":         [0, 1, 2, 0, 1, 2],      // A B C A B C
  "1v1v1v1":       [0, 1, 2, 3, 0, 1],      // A B C D A B
  "1v1v1v1v1":     [0, 1, 2, 3, 4, 0],      // A B C D E A
  "1v1v1v1v1v1":   [0, 1, 2, 3, 4, 5],      // A B C D E F
};

function getRemainingCategories(bannedIds) {
  return CATEGORY_POOL.filter(c => !bannedIds.includes(c.id));
}

function buildBanPhaseEmbed(match) {
  const remaining = getRemainingCategories(match.banPhase.bannedIds);
  const banned = CATEGORY_POOL.filter(c => match.banPhase.bannedIds.includes(c.id));
  const banOrder = BAN_ORDERS[match.banMode];
  const step = match.banPhase.step;
  const bannerIndex = banOrder[step];
  const bannerId = match.players[bannerIndex];

  const bannedList = banned.length > 0 ? banned.map(c => `~~${c.label}~~`).join('\n') : '*None yet*';
  const remainingList = remaining.map(c => `• ${c.label}`).join('\n');

  return new EmbedBuilder()
    .setTitle(`🚫 Ban Phase — Step ${step + 1}/${banOrder.length}`)
    .setDescription(`It's <@${bannerId}>'s turn to ban a category.`)
    .addFields(
      { name: `❌ Banned (${banned.length}/${banOrder.length})`, value: bannedList, inline: false },
      { name: `✅ Remaining (${remaining.length})`, value: remainingList, inline: false },
    )
    .setColor(0xe74c3c)
    .setFooter({ text: `Match ID: ${match.matchId}` })
    .setTimestamp();
}

function buildBanButtons(match) {
  const remaining = getRemainingCategories(match.banPhase.bannedIds);
  const rows = [];
  for (let i = 0; i < remaining.length; i += 5) {
    const chunk = remaining.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      chunk.map(c =>
        new ButtonBuilder()
          .setCustomId(`ban:${match.matchId}:${c.id}`)
          .setLabel(c.label)
          .setStyle(ButtonStyle.Danger)
      )
    ));
  }
  return rows.slice(0, 5);
}

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────
function randomChapter() {
  return Math.floor(Math.random() * 5) + 1;
}

function randomCategory(chapterNum) {
  const cats = CHAPTERS[chapterNum].categories;
  return cats[Math.floor(Math.random() * cats.length)];
}

function generateMatchId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function getOrInitGuild(guildId) {
  if (!matchmaking[guildId]) matchmaking[guildId] = {};
  return matchmaking[guildId];
}

function generateQueueId() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function getOrInitLeaderboard(guildId, userId) {
  if (!leaderboard[guildId]) leaderboard[guildId] = {};
  if (!leaderboard[guildId][userId]) leaderboard[guildId][userId] = { wins: 0, byChapter: {} };
  return leaderboard[guildId][userId];
}

function getOrInitBestTimes(guildId, userId) {
  if (!bestTimes[guildId]) bestTimes[guildId] = {};
  if (!bestTimes[guildId][userId]) bestTimes[guildId][userId] = {};
  return bestTimes[guildId][userId];
}

function parseTime(str) {
  str = str.trim();
  const parts = str.split(':');
  if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  return parseFloat(parts[0]);
}

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = (secs % 60).toFixed(3).padStart(6, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${s}`;
  if (m > 0) return `${m}:${s}`;
  return `${s}`;
}

// ─────────────────────────────────────────
//  EMBEDS
// ─────────────────────────────────────────
function buildQueueEmbed(mode, players, forcedChapter = null, forcedCategory = null, matchType = 'random') {
  const modeInfo = MODES[mode];
  const slots = modeInfo.slots;
  const filled = players.length;
  const playerList = players.map((p, i) => `${i + 1}. <@${p}>`).join('\n') || '*Nobody in queue...*';
  const bar = '🟢'.repeat(filled) + '⬛'.repeat(slots - filled);

  const typeLabels = {
    random: '🎲 Random chapter & category',
    bans:   '🚫 Ban phase (6 bans)',
    manual: '🎯 Manual chapter/category',
  };

  const fields = [
    { name: 'Progress', value: `${bar} (${filled}/${slots})`, inline: false },
    { name: 'Mode', value: modeInfo.label, inline: true },
    { name: 'Match Type', value: typeLabels[matchType] || matchType, inline: true },
    { name: 'Status', value: filled < slots ? '⏳ Waiting for players...' : '✅ Ready to start!', inline: true },
  ];

  if (forcedChapter) fields.push({ name: '📖 Chapter', value: CHAPTERS[forcedChapter].name, inline: false });
  if (forcedCategory) fields.push({ name: '🏷️ Category', value: forcedCategory, inline: true });

  return new EmbedBuilder()
    .setTitle(`${modeInfo.emoji} Matchmaking Queue — ${modeInfo.label}`)
    .setDescription(`**Poppy Playtime Speedrun**\n\nPlayers in queue:\n${playerList}`)
    .addFields(...fields)
    .setColor(filled < slots ? 0xf5a623 : 0x2ecc71)
    .setFooter({ text: 'Press Join to enter the queue' })
    .setTimestamp();
}

function buildMatchEmbed(players, chapter, category, matchId) {
  const playerList = players.map(p => `<@${p}>`).join(' vs ');
  return new EmbedBuilder()
    .setTitle('🎮 Match Found!')
    .setDescription(`**${playerList}**\n\nThe speedrun has begun! Submit your time once you finish.`)
    .addFields(
      { name: '📖 Chapter', value: CHAPTERS[chapter].name, inline: false },
      { name: '🏷️ Category', value: category, inline: true },
      { name: '👥 Players', value: `${players.length}`, inline: true },
      { name: '🆔 Match ID', value: `\`${matchId}\``, inline: false },
      { name: '⏱️ How to submit', value: 'Press **Submit Time** once you finish, or **Forfeit** to give up.', inline: false },
    )
    .setColor(0xe74c3c)
    .setFooter({ text: 'Good luck to everyone! 🍀' })
    .setTimestamp();
}

function buildLeaderboardEmbed(guildId, type, chapterNum, category) {
  const guildLB = leaderboard[guildId] || {};
  const entries = Object.entries(guildLB);

  if (entries.length === 0) {
    return new EmbedBuilder()
      .setTitle('🏆 Leaderboard')
      .setDescription('*No results yet.*')
      .setColor(0xf1c40f);
  }

  let sorted, title;

  if (type === 'total') {
    sorted = entries.sort((a, b) => b[1].wins - a[1].wins);
    title = '🏆 Overall Leaderboard — Total Wins';
    const medals = ['🥇', '🥈', '🥉'];
    const lines = sorted.slice(0, 10).map(([userId, data], i) =>
      `${medals[i] || `${i + 1}.`} <@${userId}> — **${data.wins}** win${data.wins !== 1 ? 's' : ''}`
    );
    return new EmbedBuilder().setTitle(title).setDescription(lines.join('\n')).setColor(0xf1c40f).setTimestamp();
  }

  if (type === 'wins') {
    const key = `${chapterNum}:${category}`;
    sorted = entries
      .filter(([, d]) => d.byChapter && d.byChapter[key] > 0)
      .sort((a, b) => (b[1].byChapter[key] || 0) - (a[1].byChapter[key] || 0));
    title = `🏆 Wins — Ch.${chapterNum} ${category}`;
    const medals = ['🥇', '🥈', '🥉'];
    const lines = sorted.slice(0, 10).map(([userId, data], i) => {
      const wins = data.byChapter[key] || 0;
      return `${medals[i] || `${i + 1}.`} <@${userId}> — **${wins}** win${wins !== 1 ? 's' : ''}`;
    });
    return new EmbedBuilder().setTitle(title).setDescription(lines.join('\n') || '*No results yet.*').setColor(0xf1c40f).setTimestamp();
  }

  if (type === 'times') {
    const key = `${chapterNum}:${category}`;
    const guildBT = bestTimes[guildId] || {};
    const timeEntries = Object.entries(guildBT)
      .map(([userId, times]) => [userId, times[key]])
      .filter(([, t]) => t !== undefined)
      .sort((a, b) => a[1] - b[1]);

    title = `⏱️ Best Times — Ch.${chapterNum} ${category}`;
    const medals = ['🥇', '🥈', '🥉'];
    const lines = timeEntries.slice(0, 10).map(([userId, t], i) =>
      `${medals[i] || `${i + 1}.`} <@${userId}> — **${formatTime(t)}**`
    );
    return new EmbedBuilder().setTitle(title).setDescription(lines.join('\n') || '*No times recorded yet.*').setColor(0x3498db).setTimestamp();
  }
}

// ─────────────────────────────────────────
//  SLASH COMMANDS
// ─────────────────────────────────────────
const chapterChoices = Object.entries(CHAPTERS).map(([num, ch]) => ({
  name: ch.name, value: String(num)
}));

const commands = [
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Join the matchmaking queue')
    .addStringOption(opt =>
      opt.setName('mode').setDescription('Game mode').setRequired(true)
        .addChoices(
          { name: '⚔️ 1v1', value: '1v1' },
          { name: '🔺 1v1v1', value: '1v1v1' },
          { name: '🟥 1v1v1v1', value: '1v1v1v1' },
          { name: '⭐ 1v1v1v1v1', value: '1v1v1v1v1' },
          { name: '🔥 1v1v1v1v1v1', value: '1v1v1v1v1v1' },
        )
    )
    .addStringOption(opt =>
      opt.setName('matchtype').setDescription('How the category is decided').setRequired(true)
        .addChoices(
          { name: '🎲 Random — bot picks chapter & category', value: 'random' },
          { name: '🚫 Bans — players ban categories (6 bans)', value: 'bans' },
          { name: '🎯 Manual — choose chapter & category yourself', value: 'manual' },
        )
    )
    .addStringOption(opt =>
      opt.setName('chapter').setDescription('Force a specific chapter (only for Manual mode)').setRequired(false)
        .addChoices(...chapterChoices)
    ),

  new SlashCommandBuilder()
    .setName('leavequeue')
    .setDescription('Leave the matchmaking queue'),

  new SlashCommandBuilder()
    .setName('queuestatus')
    .setDescription('View current queue status'),

  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll a random Chapter and Category')
    .addStringOption(opt =>
      opt.setName('chapter').setDescription('Force a specific chapter (optional)').setRequired(false)
        .addChoices(...chapterChoices)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the speedrun leaderboard')
    .addStringOption(opt =>
      opt.setName('type').setDescription('Leaderboard type').setRequired(true)
        .addChoices(
          { name: '🏆 Overall wins', value: 'total' },
          { name: '🥊 Wins by chapter/category', value: 'wins' },
          { name: '⏱️ Best times by chapter/category', value: 'times' },
        )
    )
    .addStringOption(opt =>
      opt.setName('chapter').setDescription('Chapter (required for wins/times)').setRequired(false)
        .addChoices(...chapterChoices)
    ),

  new SlashCommandBuilder()
    .setName('cancelqueue')
    .setDescription('(Admin) Cancel an active queue')
    .addStringOption(opt =>
      opt.setName('mode').setDescription('Mode to cancel').setRequired(true)
        .addChoices(
          { name: '⚔️ 1v1', value: '1v1' },
          { name: '🔺 1v1v1', value: '1v1v1' },
          { name: '🟥 1v1v1v1', value: '1v1v1v1' },
          { name: '⭐ 1v1v1v1v1', value: '1v1v1v1v1' },
          { name: '🔥 1v1v1v1v1v1', value: '1v1v1v1v1v1' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
];

// ─────────────────────────────────────────
//  READY
// ─────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot ready as ${client.user.tag}`);
  await client.application.commands.set(commands);
  console.log('✅ Slash commands registered');
});

// ─────────────────────────────────────────
//  INTERACTIONS
// ─────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // ── SLASH COMMANDS ──
  if (interaction.isChatInputCommand()) {
    const { commandName, guildId, user, channel } = interaction;

    // /roll
    if (commandName === 'roll') {
      const forcedChapter = interaction.options.getString('chapter');
      const chapter = forcedChapter ? parseInt(forcedChapter) : randomChapter();

      if (forcedChapter) {
        const categoryMenu = new StringSelectMenuBuilder()
          .setCustomId(`rollcat:${chapter}`)
          .setPlaceholder('Select a category or pick random')
          .addOptions([
            { label: '🎲 Random', value: 'random' },
            ...CHAPTERS[chapter].categories.map(c => ({ label: c, value: c }))
          ]);
        const row = new ActionRowBuilder().addComponents(categoryMenu);
        const embed = new EmbedBuilder()
          .setTitle(`📖 ${CHAPTERS[chapter].name}`)
          .setDescription('Select a category or pick a random one:')
          .setColor(0x9b59b6);
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      const category = randomCategory(chapter);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🎲 Poppy Playtime Random Roll')
          .addFields(
            { name: '📖 Chapter', value: CHAPTERS[chapter].name, inline: false },
            { name: '🏷️ Category', value: category, inline: true },
          )
          .setColor(0x9b59b6)
          .setFooter({ text: `Requested by ${user.username}` })
          .setTimestamp()]
      });
    }

    // /leaderboard
    if (commandName === 'leaderboard') {
      const type = interaction.options.getString('type');
      const chapterOpt = interaction.options.getString('chapter');

      if (type === 'wins' || type === 'times') {
        if (!chapterOpt) {
          return interaction.reply({ content: '❌ Please select a chapter for this leaderboard type.', ephemeral: true });
        }
        const chapterNum = parseInt(chapterOpt);
        const categoryMenu = new StringSelectMenuBuilder()
          .setCustomId(`lbcat:${type}:${chapterNum}`)
          .setPlaceholder('Select a category')
          .addOptions(CHAPTERS[chapterNum].categories.map(c => ({ label: c, value: c })));
        const row = new ActionRowBuilder().addComponents(categoryMenu);
        return interaction.reply({ content: `Select a category for **${CHAPTERS[chapterNum].name}**:`, components: [row], ephemeral: true });
      }

      return interaction.reply({ embeds: [buildLeaderboardEmbed(guildId, 'total')] });
    }

    // /queuestatus
    if (commandName === 'queuestatus') {
      const guildQueues = matchmaking[guildId] || {};
      const lines = [];
      for (const [mode, queues] of Object.entries(guildQueues)) {
        if (!Array.isArray(queues)) continue;
        for (const data of queues) {
          const chapterLabel = data.forcedChapter ? ` — ${CHAPTERS[data.forcedChapter].name}` : '';
          const categoryLabel = data.forcedCategory ? ` (${data.forcedCategory})` : '';
          lines.push(`${MODES[mode].emoji} **${mode}**${chapterLabel}${categoryLabel}: ${data.players.length}/${MODES[mode].slots} players [ID: ${data.queueId}]`);
        }
      }
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('📋 Queue Status')
          .setDescription(lines.length > 0 ? lines.join('\n') : '*No active queues.*')
          .setColor(0x3498db).setTimestamp()],
        ephemeral: true
      });
    }

    // /leavequeue
    if (commandName === 'leavequeue') {
      const guildQueues = getOrInitGuild(guildId);
      let found = false;
      for (const [mode, queues] of Object.entries(guildQueues)) {
        if (!Array.isArray(queues)) continue;
        for (const data of queues) {
          const idx = data.players.indexOf(user.id);
          if (idx !== -1) {
            data.players.splice(idx, 1);
            found = true;
            try {
              const ch = await client.channels.fetch(data.channelId);
              const msg = await ch.messages.fetch(data.messageId);
              await msg.edit({ embeds: [buildQueueEmbed(mode, data.players, data.forcedChapter, data.forcedCategory, data.matchType)], components: [buildQueueButtons(mode, data.queueId)] });
            } catch (_) {}
            break;
          }
        }
        if (found) break;
      }
      return interaction.reply({ content: found ? '✅ You have left the queue.' : '❌ You were not in any queue.', ephemeral: true });
    }

    // /cancelqueue
    if (commandName === 'cancelqueue') {
      const mode = interaction.options.getString('mode');
      const guildQueues = getOrInitGuild(guildId);
      if (!guildQueues[mode] || guildQueues[mode].length === 0) return interaction.reply({ content: '❌ No active queue for that mode.', ephemeral: true });
      let cancelled = 0;
      for (const data of guildQueues[mode]) {
        try {
          const ch = await client.channels.fetch(data.channelId);
          const msg = await ch.messages.fetch(data.messageId);
          await msg.delete();
        } catch (_) {}
        cancelled++;
      }
      delete guildQueues[mode];
      return interaction.reply({ content: `✅ **${cancelled}** **${mode}** queue${cancelled !== 1 ? 's' : ''} cancelled.`, ephemeral: true });
    }

    // /queue
    if (commandName === 'queue') {
      const mode = interaction.options.getString('mode');
      const matchType = interaction.options.getString('matchtype') || 'random';
      const forcedChapter = interaction.options.getString('chapter');
      const guildQueues = getOrInitGuild(guildId);

      for (const [m, queues] of Object.entries(guildQueues)) {
        if (!Array.isArray(queues)) continue;
        for (const q of queues) {
          if (q.players.includes(user.id)) {
            return interaction.reply({ content: `❌ You are already in the **${m}** queue. Use \`/leavequeue\` to leave.`, ephemeral: true });
          }
        }
      }

      // Manual mode: ask for chapter first
      if (matchType === 'manual' && forcedChapter) {
        const chapterNum = parseInt(forcedChapter);
        const categoryMenu = new StringSelectMenuBuilder()
          .setCustomId(`queuecat:${mode}:${chapterNum}:manual`)
          .setPlaceholder('Select a category or pick random')
          .addOptions([
            { label: '🎲 Random', value: 'random' },
            ...CHAPTERS[chapterNum].categories.map(c => ({ label: c, value: c }))
          ]);
        const row = new ActionRowBuilder().addComponents(categoryMenu);
        const embed = new EmbedBuilder()
          .setTitle(`📖 ${CHAPTERS[chapterNum].name}`)
          .setDescription(`Select a category for your **${mode}** match:`)
          .setColor(0xf5a623);
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      if (matchType === 'manual' && !forcedChapter) {
        return interaction.reply({ content: '❌ Please select a **chapter** when using Manual mode.', ephemeral: true });
      }

      await interaction.deferReply();
      await openQueue(mode, null, null, guildId, channel, user, interaction, matchType);
    }
  }

  // ── SELECT MENUS ──
  if (interaction.isStringSelectMenu()) {
    const { customId, guildId, user, channel } = interaction;

    if (customId.startsWith('rollcat:')) {
      const chapter = parseInt(customId.split(':')[1]);
      const selected = interaction.values[0];
      const category = selected === 'random' ? randomCategory(chapter) : selected;
      return interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle('🎲 Poppy Playtime Roll')
          .addFields(
            { name: '📖 Chapter', value: CHAPTERS[chapter].name, inline: false },
            { name: '🏷️ Category', value: category, inline: true },
          )
          .setColor(0x9b59b6)
          .setFooter({ text: `Requested by ${user.username}` })
          .setTimestamp()],
        components: []
      });
    }

    if (customId.startsWith('lbcat:')) {
      const parts = customId.split(':');
      const type = parts[1];
      const chapterNum = parseInt(parts[2]);
      const category = interaction.values[0];
      const embed = buildLeaderboardEmbed(guildId, type, chapterNum, category);
      return interaction.update({ embeds: [embed], components: [] });
    }

    if (customId.startsWith('queuecat:')) {
      const parts = customId.split(':');
      const mode = parts[1];
      const chapterNum = parseInt(parts[2]);
      const matchType = parts[3] || 'manual';
      const selected = interaction.values[0];
      const forcedCategory = selected === 'random' ? null : selected;

      await interaction.update({
        content: `✅ Opening **${mode}** queue — 🎯 **Manual** | **${CHAPTERS[chapterNum].name}** — ${forcedCategory || 'Random category'}...`,
        embeds: [], components: []
      });

      await openQueue(mode, chapterNum, forcedCategory, guildId, channel, user, null, matchType);
    }
    }
  }

  // ── BUTTONS ──
  if (interaction.isButton()) {
    const parts = interaction.customId.split(':');
    const action = parts[0];
    const { guildId, user, channel } = interaction;
    const guildQueues = getOrInitGuild(guildId);

    // Queue join/leave
    if (action === 'join' || action === 'leave') {
      const mode = parts[1];
      const queueId = parts[2];

      const queuesForMode = guildQueues[mode];
      const data = Array.isArray(queuesForMode) ? queuesForMode.find(q => q.queueId === queueId) : null;

      if (action === 'join') {
        if (!data) return interaction.reply({ content: '❌ This queue no longer exists.', ephemeral: true });
        for (const [m, queues] of Object.entries(guildQueues)) {
          if (!Array.isArray(queues)) continue;
          for (const q of queues) {
            if (q.players.includes(user.id)) {
              return interaction.reply({ content: `❌ You are already in the **${m}** queue.`, ephemeral: true });
            }
          }
        }
        data.players.push(user.id);
        const slots = MODES[mode].slots;
        await interaction.update({ embeds: [buildQueueEmbed(mode, data.players, data.forcedChapter, data.forcedCategory, data.matchType)], components: [buildQueueButtons(mode, queueId)] });
        if (data.players.length >= slots) {
          guildQueues[mode] = queuesForMode.filter(q => q.queueId !== queueId);
          if (guildQueues[mode].length === 0) delete guildQueues[mode];
          await startMatch(mode, guildId, channel, data.players.slice(), data.forcedChapter || null, data.forcedCategory || null, data.matchType || 'random');
        }
      }

      if (action === 'leave') {
        if (!data) return interaction.reply({ content: '❌ This queue no longer exists.', ephemeral: true });
        const idx = data.players.indexOf(user.id);
        if (idx === -1) return interaction.reply({ content: '❌ You are not in this queue.', ephemeral: true });
        data.players.splice(idx, 1);
        await interaction.update({ embeds: [buildQueueEmbed(mode, data.players, data.forcedChapter, data.forcedCategory, data.matchType)], components: [buildQueueButtons(mode, queueId)] });
      }
    }

    // Ban button
    if (action === 'ban') {
      const matchId = parts[1];
      const categoryId = parts[2];
      const match = activeMatches[matchId];

      if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
      if (!match.banPhase) return interaction.reply({ content: '❌ This match has no ban phase.', ephemeral: true });
      if (match.banPhase.done) return interaction.reply({ content: '❌ Ban phase is already over.', ephemeral: true });

      const banOrder = BAN_ORDERS[match.mode];
      const step = match.banPhase.step;
      const expectedPlayerIndex = banOrder[step];
      const expectedId = match.players[expectedPlayerIndex];

      if (user.id !== expectedId) {
        return interaction.reply({ content: `❌ It's not your turn to ban!`, ephemeral: true });
      }
      if (match.banPhase.bannedIds.includes(categoryId)) {
        return interaction.reply({ content: '❌ That category is already banned.', ephemeral: true });
      }

      const cat = CATEGORY_POOL.find(c => c.id === categoryId);
      if (!cat) return interaction.reply({ content: '❌ Category not found.', ephemeral: true });

      match.banPhase.bannedIds.push(categoryId);
      match.banPhase.step++;

      if (match.banPhase.step >= banOrder.length) {
        // All bans done
        match.banPhase.done = true;
        const remaining = getRemainingCategories(match.banPhase.bannedIds);
        const picked = remaining[Math.floor(Math.random() * remaining.length)];
        match.chapter = picked.chapter;
        match.category = CHAPTERS[picked.chapter].categories.find(c =>
          c.toLowerCase().replace(/[^a-z0-9]/g, '') === picked.label.split('— ')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '')
        ) || picked.label.split('— ')[1];

        const bannedSummary = CATEGORY_POOL
          .filter(c => match.banPhase.bannedIds.includes(c.id))
          .map(c => `~~${c.label}~~`).join('\n');

        await interaction.update({
          content: `✅ **${cat.label}** banned by <@${user.id}>.\n\n**Bans summary:**\n${bannedSummary}\n\n🎲 **Rolling...**`,
          embeds: [], components: [],
        });

        const replyMsg = await interaction.fetchReply();
        const delays = [400, 400, 500, 500, 600, 600, 700, 800, 900, 1000];
        for (let i = 0; i < delays.length; i++) {
          await new Promise(r => setTimeout(r, delays[i]));
          const shown = remaining[Math.floor(Math.random() * remaining.length)];
          await replyMsg.edit({ content: `✅ **${cat.label}** banned by <@${user.id}>.\n\n**Bans summary:**\n${bannedSummary}\n\n🎲 **Rolling...**\n➡️ ${shown.label}` });
        }

        const matchEmbed = buildMatchEmbed(match.players, match.chapter, match.category, matchId);
        const matchButtons = buildMatchButtons(matchId);
        await replyMsg.edit({
          content: `✅ **${cat.label}** banned by <@${user.id}>.\n\n**Bans summary:**\n${bannedSummary}\n\n✅ **Selected: ${picked.label}**`,
          embeds: [matchEmbed],
          components: [matchButtons],
        });
      } else {
        const nextPlayerIndex = banOrder[match.banPhase.step];
        const nextId = match.players[nextPlayerIndex];
        const embed = buildBanPhaseEmbed(match);
        const rows = buildBanButtons(match);
        await interaction.update({
          content: `✅ **${cat.label}** banned by <@${user.id}>. Now it's <@${nextId}>'s turn.`,
          embeds: [embed],
          components: rows,
        });
      }
    }

    // Submit time
    if (action === 'submittime') {
      const matchId = parts[1];
      const match = activeMatches[matchId];
      if (!match) return interaction.reply({ content: '❌ Match not found or already finished.', ephemeral: true });
      if (!match.players.includes(user.id)) return interaction.reply({ content: '❌ You are not part of this match.', ephemeral: true });
      if (match.times[user.id] !== undefined) return interaction.reply({ content: '❌ You already submitted your time.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`timemodal:${matchId}`)
        .setTitle('Submit your time');

      const timeInput = new TextInputBuilder()
        .setCustomId('time')
        .setLabel('Your time (e.g. 1:23.456 or 1:03:23.456)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1:23.456')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
      await interaction.showModal(modal);
    }

    // Forfeit
    if (action === 'forfeit') {
      const matchId = parts[1];
      const match = activeMatches[matchId];
      if (!match) return interaction.reply({ content: '❌ Match not found or already finished.', ephemeral: true });
      if (!match.players.includes(user.id)) return interaction.reply({ content: '❌ You are not part of this match.', ephemeral: true });
      if (match.forfeited && match.forfeited.includes(user.id)) return interaction.reply({ content: '❌ You already forfeited.', ephemeral: true });

      if (!match.forfeited) match.forfeited = [];
      match.forfeited.push(user.id);
      match.times[user.id] = Infinity;

      await interaction.reply({ content: `🏳️ <@${user.id}> has forfeited the match!`, ephemeral: false });

      // If only one player hasn't forfeited, they win automatically
      const activePlayers = match.players.filter(p => !match.forfeited.includes(p));
      if (activePlayers.length === 1) {
        match.times[activePlayers[0]] = 0;
      }

      try {
        const matchChannel = await client.channels.fetch(match.matchChannelId);
        await updateStatusEmbed(match, matchChannel);
      } catch (_) {}

      const allDone = match.players.every(p => match.times[p] !== undefined);
      if (allDone) await resolveMatch(matchId);
    }
  }

  // ── MODALS ──
  if (interaction.isModalSubmit()) {
    const { customId, user, guildId } = interaction;

    if (customId.startsWith('timemodal:')) {
      const matchId = customId.split(':')[1];
      const match = activeMatches[matchId];
      if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });

      const rawTime = interaction.fields.getTextInputValue('time');
      const secs = parseTime(rawTime);

      if (isNaN(secs) || secs <= 0) {
        return interaction.reply({ content: '❌ Invalid time format. Use `1:23.456` or `1:03:23.456`.', ephemeral: true });
      }

      match.times[user.id] = secs;

      // Update personal best time
      const bt = getOrInitBestTimes(guildId, user.id);
      const key = `${match.chapter}:${match.category}`;
      if (bt[key] === undefined || secs < bt[key]) {
        bt[key] = secs;
      }
      saveData();

      await interaction.reply({ content: `✅ Time **${formatTime(secs)}** submitted!`, ephemeral: true });

      try {
        const matchChannel = await client.channels.fetch(match.matchChannelId);
        await updateStatusEmbed(match, matchChannel);
      } catch (_) {}

      const allDone = match.players.every(p => match.times[p] !== undefined);
      if (allDone) await resolveMatch(matchId);
    }
  }
});

// ─────────────────────────────────────────
//  FUNCIONES AUXILIARES
// ─────────────────────────────────────────
function buildQueueButtons(mode, queueId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${mode}:${queueId}`).setLabel('Join').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`leave:${mode}:${queueId}`).setLabel('Leave').setStyle(ButtonStyle.Danger).setEmoji('❌'),
  );
}

function buildMatchButtons(matchId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`submittime:${matchId}`).setLabel('Submit Time').setStyle(ButtonStyle.Primary).setEmoji('⏱️'),
    new ButtonBuilder().setCustomId(`forfeit:${matchId}`).setLabel('Forfeit').setStyle(ButtonStyle.Danger).setEmoji('🏳️'),
  );
}

async function updateStatusEmbed(match, matchChannel) {
  const submittedLines = match.players.map(p => {
    if (match.forfeited && match.forfeited.includes(p)) return `<@${p}>: 🏳️ *Forfeited*`;
    const t = match.times[p];
    if (t === 0) return `<@${p}>: 🏆 *Last player standing*`;
    return t !== undefined ? `<@${p}>: **${formatTime(t)}**` : `<@${p}>: ⏳ *waiting...*`;
  });

  const statusEmbed = new EmbedBuilder()
    .setTitle('⏱️ Time Submissions')
    .setDescription(submittedLines.join('\n'))
    .setColor(0x3498db)
    .setTimestamp();

  if (match.statusMessageId) {
    try {
      const oldMsg = await matchChannel.messages.fetch(match.statusMessageId);
      await oldMsg.edit({ embeds: [statusEmbed] });
      return;
    } catch (_) {}
  }
  const newMsg = await matchChannel.send({ embeds: [statusEmbed] });
  match.statusMessageId = newMsg.id;
}

async function openQueue(mode, forcedChapter, forcedCategory, guildId, channel, user, interaction, matchType = 'random') {
  const guildQueues = getOrInitGuild(guildId);

  if (!guildQueues[mode]) guildQueues[mode] = [];

  const queuesForMode = guildQueues[mode];

  if (queuesForMode.length >= 99) {
    const errMsg = `❌ There are already **99** open **${mode}** queues. Please wait for one to finish.`;
    if (interaction) await interaction.editReply({ content: errMsg });
    else await channel.send(errMsg);
    return;
  }

  const queueId = generateQueueId();
  const newQueue = {
    queueId,
    players: [user.id],
    messageId: null,
    channelId: channel.id,
    forcedChapter: forcedChapter ?? null,
    forcedCategory: forcedCategory ?? null,
    matchType,
  };
  queuesForMode.push(newQueue);

  const slots = MODES[mode].slots;
  const embed = buildQueueEmbed(mode, newQueue.players, newQueue.forcedChapter, newQueue.forcedCategory, matchType);
  const row = buildQueueButtons(mode, queueId);

  let msg;
  if (interaction) {
    await interaction.editReply({ embeds: [embed], components: [row] });
    msg = await interaction.fetchReply();
  } else {
    msg = await channel.send({ embeds: [embed], components: [row] });
  }
  newQueue.messageId = msg ? msg.id : null;

  // Ping the 1v1 role
  try {
    const typeLabels = { random: '🎲 Random', bans: '🚫 Bans', manual: '🎯 Manual' };
    const role = channel.guild.roles.cache.find(r => r.name === '1v1');
    if (role) await channel.send({ content: `${role} — a new **${mode}** queue has opened! [${typeLabels[matchType] || matchType}]` });
  } catch (_) {}

  if (newQueue.players.length >= slots) {
    guildQueues[mode] = queuesForMode.filter(q => q.queueId !== queueId);
    if (guildQueues[mode].length === 0) delete guildQueues[mode];
    await startMatch(mode, guildId, channel, newQueue.players.slice(), newQueue.forcedChapter, newQueue.forcedCategory, matchType);
    return;
  }

  // Auto-expire after 5 minutes
  setTimeout(async () => {
    const currentQueues = matchmaking[guildId]?.[mode];
    if (!Array.isArray(currentQueues)) return;
    const stillExists = currentQueues.find(q => q.queueId === queueId);
    if (!stillExists) return;
    matchmaking[guildId][mode] = currentQueues.filter(q => q.queueId !== queueId);
    if (matchmaking[guildId][mode].length === 0) delete matchmaking[guildId][mode];
    try {
      const ch = await client.channels.fetch(stillExists.channelId);
      const oldMsg = await ch.messages.fetch(stillExists.messageId);
      const expiredEmbed = new EmbedBuilder()
        .setTitle(`${MODES[mode].emoji} Queue Expired — ${MODES[mode].label}`)
        .setDescription('⏰ **This queue expired** after 5 minutes without filling up.')
        .setColor(0x95a5a6).setTimestamp();
      await oldMsg.edit({ embeds: [expiredEmbed], components: [] });
    } catch (_) {}
  }, 5 * 60 * 1000);
}

async function startMatch(mode, guildId, channel, players, forcedChapter = null, forcedCategory = null, matchType = 'random') {
  const matchId = generateMatchId();

  let matchChannel;
  try {
    matchChannel = await channel.guild.channels.create({
      name: `match-${matchId.toLowerCase()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: channel.guild.roles.everyone, deny: ['ViewChannel'] },
        ...players.map(playerId => ({ id: playerId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] })),
        { id: client.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels'] },
      ],
    });
  } catch (err) {
    console.error('Could not create match channel:', err);
    matchChannel = channel;
  }

  const mentions = players.map(p => `<@${p}>`).join(' ');

  if (matchType === 'bans') {
    // Ban phase — chapter/category decided after bans
    activeMatches[matchId] = {
      matchId, mode, players, matchType,
      chapter: null, category: null,
      times: {}, forfeited: [],
      guildId, channelId: channel.id, matchChannelId: matchChannel.id,
      statusMessageId: null,
      banPhase: { bannedIds: [], step: 0, done: false },
    };

    await channel.send({ content: `🎮 **Match found!** ${mentions} → ${matchChannel}` });

    const match = activeMatches[matchId];
    const embed = buildBanPhaseEmbed(match);
    const rows = buildBanButtons(match);
    const banOrder = BAN_ORDERS[mode];
    const firstBannerId = players[banOrder[0]];

    await matchChannel.send({
      content: `${mentions}\n\n🚫 **Ban phase has started!** <@${firstBannerId}> goes first. (6 bans total)`,
      embeds: [embed],
      components: rows,
    });
  } else {
    // Random or manual — chapter/category already decided
    const chapter = (forcedChapter !== null && forcedChapter !== undefined) ? forcedChapter : randomChapter();
    const category = (forcedCategory !== null && forcedCategory !== undefined) ? forcedCategory : randomCategory(chapter);

    activeMatches[matchId] = {
      matchId, mode, players, matchType,
      chapter, category,
      times: {}, forfeited: [],
      guildId, channelId: channel.id, matchChannelId: matchChannel.id,
      statusMessageId: null,
    };

    const embed = buildMatchEmbed(players, chapter, category, matchId);
    const buttons = buildMatchButtons(matchId);

    await channel.send({ content: `🎮 **Match found!** ${mentions} → ${matchChannel}` });
    await matchChannel.send({
      content: `${mentions}\n\n🏁 **Your match has started!** Submit your time once you finish.`,
      embeds: [embed],
      components: [buttons],
    });
  }
}

async function resolveMatch(matchId) {
  const match = activeMatches[matchId];
  if (!match) return;

  // Find winner — lowest time (forfeited = Infinity, last standing = 0)
  let winnerId = null;
  let lowestTime = Infinity;
  for (const [playerId, time] of Object.entries(match.times)) {
    if (time < lowestTime) {
      lowestTime = time;
      winnerId = playerId;
    }
  }

  const lastStanding = lowestTime === 0; // won by all others forfeiting

  // Update leaderboard
  if (winnerId) {
    const lb = getOrInitLeaderboard(match.guildId, winnerId);
    lb.wins += 1;
    const key = `${match.chapter}:${match.category}`;
    lb.byChapter[key] = (lb.byChapter[key] || 0) + 1;
    saveData();
  }

  // Build results — sort: winner first (time=0 or lowest), forfeits last
  const sorted = Object.entries(match.times).sort((a, b) => a[1] - b[1]);
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const resultLines = sorted.map(([pid, t], i) => {
    const forfeited = match.forfeited && match.forfeited.includes(pid);
    let timeStr;
    if (forfeited) timeStr = '🏳️ Forfeit';
    else if (t === 0) timeStr = '🏆 Last player standing';
    else timeStr = `**${formatTime(t)}**`;
    return `${medals[i] || `${i + 1}.`} <@${pid}> — ${timeStr}${pid === winnerId ? ' 🏆 Winner!' : ''}`;
  });

  const resultEmbed = new EmbedBuilder()
    .setTitle('🏁 Match Results')
    .setDescription(resultLines.join('\n'))
    .addFields(
      { name: '📖 Chapter', value: CHAPTERS[match.chapter].name, inline: true },
      { name: '🏷️ Category', value: match.category, inline: true },
    )
    .setColor(0x2ecc71)
    .setTimestamp();

  // Post results in match channel then delete it
  try {
    const matchChannel = await client.channels.fetch(match.matchChannelId);
    await matchChannel.send({ embeds: [resultEmbed] });
    await matchChannel.send('🗑️ **This channel will be deleted in 30 seconds.**');
    setTimeout(async () => {
      try { await matchChannel.delete(); } catch (_) {}
    }, 30000);
  } catch (_) {}

  // Announce results in the original queue channel
  try {
    const mainChannel = await client.channels.fetch(match.channelId);
    const winnerLine = lastStanding
      ? `🏆 <@${winnerId}> wins by last player standing!`
      : `🏆 <@${winnerId}> wins with a time of **${formatTime(lowestTime)}**!`;

    const announcementEmbed = new EmbedBuilder()
      .setTitle('🏁 Match finished!')
      .setDescription(winnerLine)
      .addFields(
        { name: '📖 Chapter', value: CHAPTERS[match.chapter].name, inline: true },
        { name: '🏷️ Category', value: match.category, inline: true },
      )
      .setDescription(`${winnerLine}\n\n${resultLines.join('\n')}`)
      .setColor(0x2ecc71)
      .setTimestamp();

    await mainChannel.send({ embeds: [announcementEmbed] });
  } catch (_) {}

  delete activeMatches[matchId];
}

// ─────────────────────────────────────────
//  INICIO
// ─────────────────────────────────────────
(async () => {
  await connectDB();
  const saved = await loadData();
  leaderboard = saved.leaderboard;
  bestTimes = saved.bestTimes;
  client.login(process.env.DISCORD_TOKEN);
})();
