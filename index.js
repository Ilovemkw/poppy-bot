require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

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
//  ESTADO DE PARTIDAS
// ─────────────────────────────────────────
// matchmaking[guildId][mode] = { players: [], messageId, channelId }
const matchmaking = {};

// activeMatches[matchId] = { players, chapter, category, startedAt, guildId, channelId }
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

function buildQueueEmbed(mode, players, guildId) {
  const modeInfo = MODES[mode];
  const slots = modeInfo.slots;
  const filled = players.length;

  const playerList = players.map((p, i) => `${i + 1}. <@${p}>`).join('\n') || '*Nobody in queue...*';
  const emptySlots = slots - filled;
  const bar = '🟢'.repeat(filled) + '⬛'.repeat(emptySlots);

  return new EmbedBuilder()
    .setTitle(`${modeInfo.emoji} Matchmaking Queue — ${modeInfo.label}`)
    .setDescription(`**Poppy Playtime Speedrun**\n\nPlayers in queue:\n${playerList}`)
    .addFields(
      { name: 'Progress', value: `${bar} (${filled}/${slots})`, inline: false },
      { name: 'Mode', value: modeInfo.label, inline: true },
      { name: 'Status', value: filled < slots ? '⏳ Waiting for players...' : '✅ Ready to start!', inline: true }
    )
    .setColor(filled < slots ? 0xf5a623 : 0x2ecc71)
    .setFooter({ text: 'Press Join to enter the queue' })
    .setTimestamp();
}

function buildMatchEmbed(players, chapter, category, matchId) {
  const chapterData = CHAPTERS[chapter];
  const playerList = players.map(p => `<@${p}>`).join(' vs ');

  return new EmbedBuilder()
    .setTitle('🎮 Match Found!')
    .setDescription(`**${playerList}**\n\nThe speedrun has begun! First one to finish wins.`)
    .addFields(
      { name: '📖 Chapter', value: chapterData.name, inline: false },
      { name: '🏷️ Category', value: category, inline: true },
      { name: '👥 Players', value: `${players.length}`, inline: true },
      { name: '🆔 Match ID', value: `\`${matchId}\``, inline: false },
    )
    .setColor(0xe74c3c)
    .setFooter({ text: 'Good luck to everyone! 🍀' })
    .setTimestamp();
}

// ─────────────────────────────────────────
//  REGISTRO DE SLASH COMMANDS
// ─────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Únete a la cola de matchmaking de Poppy Playtime')
    .addStringOption(opt =>
      opt.setName('modo')
        .setDescription('Modo de juego')
        .setRequired(true)
        .addChoices(
          { name: '⚔️ 1v1', value: '1v1' },
          { name: '🔺 1v1v1', value: '1v1v1' },
          { name: '🟥 1v1v1v1', value: '1v1v1v1' },
        )
    ),

  new SlashCommandBuilder()
    .setName('leavequeue')
    .setDescription('Sal de la cola de matchmaking'),

  new SlashCommandBuilder()
    .setName('queuestatus')
    .setDescription('Ve el estado actual de las colas'),

  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Sortea un Chapter y Categoría aleatoria de Poppy Playtime'),

  new SlashCommandBuilder()
    .setName('cancelqueue')
    .setDescription('(Admin) Cancela una cola activa')
    .addStringOption(opt =>
      opt.setName('modo')
        .setDescription('Modo a cancelar')
        .setRequired(true)
        .addChoices(
          { name: '⚔️ 1v1', value: '1v1' },
          { name: '🔺 1v1v1', value: '1v1v1' },
          { name: '🟥 1v1v1v1', value: '1v1v1v1' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
];

// ─────────────────────────────────────────
//  EVENTOS
// ─────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  // Registrar comandos globalmente (puede tardar hasta 1h en propagarse)
  // Para pruebas rápidas, registra por guild:
  // await client.guilds.cache.get('TU_GUILD_ID').commands.set(commands);
  await client.application.commands.set(commands);
  console.log('✅ Slash commands registrados');
});

client.on('interactionCreate', async (interaction) => {
  // ── SLASH COMMANDS ──
  if (interaction.isChatInputCommand()) {
    const { commandName, guildId, user, channel } = interaction;

    // /roll — quick roll without matchmaking
    if (commandName === 'roll') {
      const chapter = randomChapter();
      const category = randomCategory(chapter);
      const chapterData = CHAPTERS[chapter];

      const embed = new EmbedBuilder()
        .setTitle('🎲 Poppy Playtime Random Roll')
        .addFields(
          { name: '📖 Chapter', value: chapterData.name, inline: false },
          { name: '🏷️ Category', value: category, inline: true },
        )
        .setColor(0x9b59b6)
        .setFooter({ text: `Requested by ${user.username}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // /queuestatus
    if (commandName === 'queuestatus') {
      const guildQueues = matchmaking[guildId] || {};
      const lines = [];

      for (const [mode, data] of Object.entries(guildQueues)) {
        if (data && data.players) {
          const modeInfo = MODES[mode];
          lines.push(`${modeInfo.emoji} **${mode}**: ${data.players.length}/${modeInfo.slots} players`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Queue Status')
        .setDescription(lines.length > 0 ? lines.join('\n') : '*No active queues.*')
        .setColor(0x3498db)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
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

          // Update queue message
          try {
            const ch = await client.channels.fetch(data.channelId);
            const msg = await ch.messages.fetch(data.messageId);
            const row = buildQueueButtons(mode);
            await msg.edit({ embeds: [buildQueueEmbed(mode, data.players, guildId)], components: [row] });
          } catch (_) {}
        }
      }

      return interaction.reply({
        content: found ? '✅ You have left the queue.' : '❌ You were not in any queue.',
        ephemeral: true
      });
    }

    // /cancelqueue (admin)
    if (commandName === 'cancelqueue') {
      const mode = interaction.options.getString('modo');
      const guildQueues = getOrInitGuild(guildId);

      if (!guildQueues[mode]) {
        return interaction.reply({ content: '❌ No active queue for that mode.', ephemeral: true });
      }

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
      const mode = interaction.options.getString('modo');
      const guildQueues = getOrInitGuild(guildId);

      // Already in a queue?
      for (const [m, data] of Object.entries(guildQueues)) {
        if (data && data.players && data.players.includes(user.id)) {
          return interaction.reply({ content: `❌ You are already in the **${m}** queue. Use \`/leavequeue\` to leave.`, ephemeral: true });
        }
      }

      // Start queue if it doesn't exist
      if (!guildQueues[mode]) {
        guildQueues[mode] = { players: [], messageId: null, channelId: channel.id };
      }

      const data = guildQueues[mode];
      data.players.push(user.id);

      const slots = MODES[mode].slots;
      const embed = buildQueueEmbed(mode, data.players, guildId);
      const row = buildQueueButtons(mode);

      await interaction.reply({ embeds: [embed], components: [row] });
      const msg = await interaction.fetchReply();
      data.messageId = msg.id;

      // Queue full? → start match
      if (data.players.length >= slots) {
        await startMatch(mode, guildId, channel, data.players.slice());
        delete guildQueues[mode];
      }
    }
  }

  // ── BOTONES ──
  if (interaction.isButton()) {
    const [action, mode] = interaction.customId.split(':');
    const { guildId, user, channel } = interaction;
    const guildQueues = getOrInitGuild(guildId);

    if (action === 'join') {
      if (!guildQueues[mode]) {
        return interaction.reply({ content: '❌ This queue no longer exists.', ephemeral: true });
      }

      const data = guildQueues[mode];

      // Already in queue?
      for (const [m, d] of Object.entries(guildQueues)) {
        if (d && d.players && d.players.includes(user.id)) {
          return interaction.reply({ content: `❌ You are already in the **${m}** queue.`, ephemeral: true });
        }
      }

      data.players.push(user.id);
      const slots = MODES[mode].slots;

      const row = buildQueueButtons(mode);
      await interaction.update({ embeds: [buildQueueEmbed(mode, data.players, guildId)], components: [row] });

      // Queue full?
      if (data.players.length >= slots) {
        await startMatch(mode, guildId, channel, data.players.slice());
        delete guildQueues[mode];
      }

    } else if (action === 'leave') {
      if (!guildQueues[mode]) {
        return interaction.reply({ content: '❌ This queue no longer exists.', ephemeral: true });
      }

      const data = guildQueues[mode];
      const idx = data.players.indexOf(user.id);

      if (idx === -1) {
        return interaction.reply({ content: '❌ You are not in this queue.', ephemeral: true });
      }

      data.players.splice(idx, 1);
      const row = buildQueueButtons(mode);
      await interaction.update({ embeds: [buildQueueEmbed(mode, data.players, guildId)], components: [row] });
    }
  }
});

// ─────────────────────────────────────────
//  FUNCIONES AUXILIARES
// ─────────────────────────────────────────
function buildQueueButtons(mode) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join:${mode}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`leave:${mode}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
  );
}

async function startMatch(mode, guildId, channel, players) {
  const chapter = randomChapter();
  const category = randomCategory(chapter);
  const matchId = generateMatchId();

  activeMatches[matchId] = {
    players,
    chapter,
    category,
    startedAt: new Date(),
    guildId,
    channelId: channel.id,
  };

  const embed = buildMatchEmbed(players, chapter, category, matchId);

  // Mencionar a todos los jugadores
  const mentions = players.map(p => `<@${p}>`).join(' ');

  await channel.send({
    content: `🎮 **Match found!** ${mentions}`,
    embeds: [embed],
  });
}

// ─────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
