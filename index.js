require('dotenv').config();
const fs = require('fs');
const path = require('path');
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
//  PERSISTENCIA EN DISCO
// ─────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load data.json:', e);
  }
  return { leaderboard: {}, bestTimes: {} };
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ leaderboard, bestTimes }, null, 2));
  } catch (e) {
    console.error('Failed to save data.json:', e);
  }
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
    name: "Chapter 4: The Cauldron",
    categories: [
      "Any% - Unrestricted",
      "Any% - OOB",
      "Any% - Inbounds",
      "Any% - NMS",
    ]
  },
  5: {
    name: "Chapter 5: The Returning Evil",
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
const saved = loadData();
// leaderboard[guildId][userId] = { wins, byChapter: { "1:Any% - OOB": N } }
const leaderboard = saved.leaderboard || {};
// bestTimes[guildId][userId]["1:Any% - OOB"] = bestTimeInSeconds
const bestTimes = saved.bestTimes || {};

// Estado en memoria (no necesita persistencia)
const matchmaking = {};
const activeMatches = {};

const MODES = {
  "1v1":     { slots: 2, label: "1v1",     emoji: "⚔️" },
  "1v1v1":   { slots: 3, label: "1v1v1",   emoji: "🔺" },
  "1v1v1v1": { slots: 4, label: "1v1v1v1", emoji: "🟥" },
};

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
function buildQueueEmbed(mode, players, forcedChapter = null, forcedCategory = null) {
  const modeInfo = MODES[mode];
  const slots = modeInfo.slots;
  const filled = players.length;
  const playerList = players.map((p, i) => `${i + 1}. <@${p}>`).join('\n') || '*Nobody in queue...*';
  const bar = '🟢'.repeat(filled) + '⬛'.repeat(slots - filled);

  const fields = [
    { name: 'Progress', value: `${bar} (${filled}/${slots})`, inline: false },
    { name: 'Mode', value: modeInfo.label, inline: true },
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
        )
    )
    .addStringOption(opt =>
      opt.setName('chapter').setDescription('Force a specific chapter (optional)').setRequired(false)
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
      for (const [mode, data] of Object.entries(guildQueues)) {
        if (data && data.players) {
          lines.push(`${MODES[mode].emoji} **${mode}**: ${data.players.length}/${MODES[mode].slots} players`);
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
      for (const [mode, data] of Object.entries(guildQueues)) {
        if (!data || !data.players) continue;
        const idx = data.players.indexOf(user.id);
        if (idx !== -1) {
          data.players.splice(idx, 1);
          found = true;
          try {
            const ch = await client.channels.fetch(data.channelId);
            const msg = await ch.messages.fetch(data.messageId);
            await msg.edit({ embeds: [buildQueueEmbed(mode, data.players, data.forcedChapter, data.forcedCategory)], components: [buildQueueButtons(mode)] });
          } catch (_) {}
        }
      }
      return interaction.reply({ content: found ? '✅ You have left the queue.' : '❌ You were not in any queue.', ephemeral: true });
    }

    // /cancelqueue
    if (commandName === 'cancelqueue') {
      const mode = interaction.options.getString('mode');
      const guildQueues = getOrInitGuild(guildId);
      if (!guildQueues[mode]) return interaction.reply({ content: '❌ No active queue for that mode.', ephemeral: true });
      try {
        const ch = await client.channels.fetch(guildQueues[mode].channelId);
        const msg = await ch.messages.fetch(guildQueues[mode].messageId);
        await msg.delete();
      } catch (_) {}
      delete guildQueues[mode];
      return interaction.reply({ content: `✅ **${mode}** queue cancelled.`, ephemeral: true });
    }

    // /queue
    if (commandName === 'queue') {
      const mode = interaction.options.getString('mode');
      const forcedChapter = interaction.options.getString('chapter');
      const guildQueues = getOrInitGuild(guildId);

      for (const [m, data] of Object.entries(guildQueues)) {
        if (data && data.players && data.players.includes(user.id)) {
          return interaction.reply({ content: `❌ You are already in the **${m}** queue. Use \`/leavequeue\` to leave.`, ephemeral: true });
        }
      }

      if (forcedChapter) {
        const chapterNum = parseInt(forcedChapter);
        const categoryMenu = new StringSelectMenuBuilder()
          .setCustomId(`queuecat:${mode}:${chapterNum}`)
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

      await interaction.deferReply();
      await openQueue(mode, null, null, guildId, channel, user, interaction);
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
      const [, mode, chapterStr] = customId.split(':');
      const chapterNum = parseInt(chapterStr);
      const selected = interaction.values[0];
      const forcedCategory = selected === 'random' ? null : selected;

      await interaction.update({
        content: `✅ Opening **${mode}** queue for **${CHAPTERS[chapterNum].name}** — ${forcedCategory || 'Random category'}...`,
        embeds: [], components: []
      });

      await openQueue(mode, chapterNum, forcedCategory, guildId, channel, user, null);
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

      if (action === 'join') {
        if (!guildQueues[mode]) return interaction.reply({ content: '❌ This queue no longer exists.', ephemeral: true });
        const data = guildQueues[mode];
        for (const [m, d] of Object.entries(guildQueues)) {
          if (d && d.players && d.players.includes(user.id)) {
            return interaction.reply({ content: `❌ You are already in the **${m}** queue.`, ephemeral: true });
          }
        }
        data.players.push(user.id);
        const slots = MODES[mode].slots;
        await interaction.update({ embeds: [buildQueueEmbed(mode, data.players, data.forcedChapter, data.forcedCategory)], components: [buildQueueButtons(mode)] });
        if (data.players.length >= slots) {
          await startMatch(mode, guildId, channel, data.players.slice(), data.forcedChapter || null, data.forcedCategory || null);
          delete guildQueues[mode];
        }
      }

      if (action === 'leave') {
        if (!guildQueues[mode]) return interaction.reply({ content: '❌ This queue no longer exists.', ephemeral: true });
        const data = guildQueues[mode];
        const idx = data.players.indexOf(user.id);
        if (idx === -1) return interaction.reply({ content: '❌ You are not in this queue.', ephemeral: true });
        data.players.splice(idx, 1);
        await interaction.update({ embeds: [buildQueueEmbed(mode, data.players, data.forcedChapter, data.forcedCategory)], components: [buildQueueButtons(mode)] });
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

      // Mark as forfeit time (Infinity so they always lose)
      match.times[user.id] = Infinity;

      await interaction.reply({ content: `🏳️ <@${user.id}> has forfeited the match!`, ephemeral: false });

      // Update status embed
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
function buildQueueButtons(mode) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${mode}`).setLabel('Join').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`leave:${mode}`).setLabel('Leave').setStyle(ButtonStyle.Danger).setEmoji('❌'),
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

async function openQueue(mode, forcedChapter, forcedCategory, guildId, channel, user, interaction) {
  const guildQueues = getOrInitGuild(guildId);

  if (!guildQueues[mode]) {
    guildQueues[mode] = {
      players: [],
      messageId: null,
      channelId: channel.id,
      forcedChapter: forcedChapter ?? null,
      forcedCategory: forcedCategory ?? null,
    };
  }

  const data = guildQueues[mode];

  // Always lock in the forced values from the queue creator
  // so latecomers can't overwrite them
  const effectiveChapter = data.forcedChapter;
  const effectiveCategory = data.forcedCategory;

  data.players.push(user.id);
  const slots = MODES[mode].slots;

  const embed = buildQueueEmbed(mode, data.players, effectiveChapter, effectiveCategory);
  const row = buildQueueButtons(mode);

  let msg;
  if (interaction) {
    await interaction.editReply({ embeds: [embed], components: [row] });
    msg = await interaction.fetchReply();
  } else {
    msg = await channel.send({ embeds: [embed], components: [row] });
  }
  data.messageId = msg ? msg.id : null;

  if (data.players.length >= slots) {
    await startMatch(mode, guildId, channel, data.players.slice(), data.forcedChapter, data.forcedCategory);
    delete guildQueues[mode];
  }
}

async function startMatch(mode, guildId, channel, players, forcedChapter = null, forcedCategory = null) {
  // Always respect forced values — never fall back to random if they were set
  const chapter = (forcedChapter !== null && forcedChapter !== undefined) ? forcedChapter : randomChapter();
  const category = (forcedCategory !== null && forcedCategory !== undefined) ? forcedCategory : randomCategory(chapter);
  const matchId = generateMatchId();

  let matchChannel;
  try {
    matchChannel = await channel.guild.channels.create({
      name: `match-${matchId.toLowerCase()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: channel.guild.roles.everyone, deny: ['ViewChannel'] },
        ...players.map(playerId => ({
          id: playerId,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        })),
        {
          id: client.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels'],
        },
      ],
    });
  } catch (err) {
    console.error('Could not create match channel:', err);
    matchChannel = channel;
  }

  activeMatches[matchId] = {
    players,
    chapter,
    category,
    times: {},
    forfeited: [],
    startedAt: new Date(),
    guildId,
    channelId: channel.id,
    matchChannelId: matchChannel.id,
    statusMessageId: null,
  };

  const embed = buildMatchEmbed(players, chapter, category, matchId);
  const buttons = buildMatchButtons(matchId);
  const mentions = players.map(p => `<@${p}>`).join(' ');

  await channel.send({ content: `🎮 **Match found!** ${mentions} → ${matchChannel}` });
  await matchChannel.send({
    content: `${mentions}\n\n🏁 **Your match has started!** Submit your time once you finish.`,
    embeds: [embed],
    components: [buttons],
  });
}

async function resolveMatch(matchId) {
  const match = activeMatches[matchId];
  if (!match) return;

  // Find winner — lowest non-Infinity time
  let winnerId = null;
  let lowestTime = Infinity;
  for (const [playerId, time] of Object.entries(match.times)) {
    if (time < lowestTime) {
      lowestTime = time;
      winnerId = playerId;
    }
  }

  // Update leaderboard
  if (winnerId) {
    const lb = getOrInitLeaderboard(match.guildId, winnerId);
    lb.wins += 1;
    const key = `${match.chapter}:${match.category}`;
    lb.byChapter[key] = (lb.byChapter[key] || 0) + 1;
    saveData();
  }

  // Build results
  const sorted = Object.entries(match.times).sort((a, b) => a[1] - b[1]);
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  const resultLines = sorted.map(([pid, t], i) => {
    const forfeited = match.forfeited && match.forfeited.includes(pid);
    const timeStr = forfeited ? '🏳️ Forfeit' : `**${formatTime(t)}**`;
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

  try {
    const matchChannel = await client.channels.fetch(match.matchChannelId);
    await matchChannel.send({ embeds: [resultEmbed] });
    await matchChannel.send('🗑️ **This channel will be deleted in 30 seconds.**');
    setTimeout(async () => {
      try { await matchChannel.delete(); } catch (_) {}
    }, 30000);
  } catch (_) {}

  delete activeMatches[matchId];
}

// ─────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
