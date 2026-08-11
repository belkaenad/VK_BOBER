const { VK, Keyboard, getRandomId } = require('vk-io');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// === КОНФИГУРАЦИЯ ===
const VK_TOKEN = process.env.VK_TOKEN;
const CONFIRMATION_TOKEN = process.env.VK_CONFIRMATION_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NOTES = 'notes';
const SHEET_STATS = 'stats';

// === ИНИЦИАЛИЗАЦИЯ VK ===
const vk = new VK({
  token: VK_TOKEN,
  apiVersion: '5.199',
});

// === СОСТОЯНИЕ ИГРЫ (в памяти, сбрасывается при рестарте функции) ===
const gameStates = new Map(); // userId -> { number: 42, attempts: 3 }

// === GOOGLE SHEETS ===
async function getAuth() {
  const credentials = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'service-account.json'), 'utf8')
  );
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function ensureSheet(sheetName) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
    });
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:D1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Дата', 'User ID', 'Действие', 'Данные']] },
    });
  }
}

async function logAction(userId, action, data = '') {
  try {
    await ensureSheet(SHEET_STATS);
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_STATS}!A:D`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[new Date().toISOString(), userId, action, data]],
      },
    });
  } catch (err) {
    console.error('Ошибка логирования:', err.message);
  }
}

async function addNote(userId, text) {
  await ensureSheet(SHEET_NOTES);
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NOTES}!A:D`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[new Date().toISOString(), userId, 'add', text]],
    },
  });
}

async function getNotes(userId) {
  try {
    await ensureSheet(SHEET_NOTES);
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NOTES}!A:D`,
    });
    const rows = result.data.values || [];
    return rows
      .slice(1) // пропускаем шапку
      .filter((row) => Number(row[1]) === userId && row[2] === 'add')
      .map((row) => ({ date: row[0], text: row[3] }));
  } catch {
    return [];
  }
}

// === КЛАВИАТУРЫ ===
function mainMenuKeyboard() {
  return Keyboard.builder()
    .inline(true)
    .textButton({
      label: '🎮 Играть в "Угадай число"',
      payload: { cmd: 'game_start' },
      color: Keyboard.POSITIVE_COLOR,
    })
    .row()
    .textButton({
      label: '📝 Мои заметки',
      payload: { cmd: 'notes_list' },
      color: Keyboard.PRIMARY_COLOR,
    })
    .row()
    .textButton({
      label: '➕ Добавить заметку',
      payload: { cmd: 'notes_add' },
      color: Keyboard.SECONDARY_COLOR,
    })
    .row()
    .textButton({
      label: 'ℹ️ Что я умею?',
      payload: { cmd: 'help' },
      color: Keyboard.SECONDARY_COLOR,
    });
}

function gameKeyboard() {
  const builder = Keyboard.builder().inline(true);
  // Кнопки с числами 1-5
  for (let i = 1; i <= 5; i++) {
    builder.textButton({
      label: String(i),
      payload: { cmd: 'game_guess', number: i },
      color: Keyboard.PRIMARY_COLOR,
    });
  }
  builder.row();
  for (let i = 6; i <= 10; i++) {
    builder.textButton({
      label: String(i),
      payload: { cmd: 'game_guess', number: i },
      color: Keyboard.PRIMARY_COLOR,
    });
  }
  builder.row().textButton({
    label: '❌ Отмена',
    payload: { cmd: 'game_cancel' },
    color: Keyboard.NEGATIVE_COLOR,
  });
  return builder;
}

function backKeyboard() {
  return Keyboard.builder()
    .inline(true)
    .textButton({
      label: '🔙 В главное меню',
      payload: { cmd: 'menu' },
      color: Keyboard.SECONDARY_COLOR,
    });
}

// === ОБРАБОТЧИКИ ===
async function handleMainMenu(peerId) {
  await vk.api.messages.send({
    peer_id: peerId,
    message: '👋 Главное меню. Что хочешь сделать?',
    keyboard: mainMenuKeyboard(),
    random_id: getRandomId(),
  });
}

async function handleHelp(peerId) {
  await vk.api.messages.send({
    peer_id: peerId,
    message:
      '🤖 *Что я умею:*\n\n' +
      '🎮 *Игра "Угадай число"* — я загадал число от 1 до 10, угадай!\n' +
      '📝 *Заметки* — сохраняй важные мысли, они хранятся в Google Таблице\n' +
      '📊 *Статистика* — все твои действия логируются\n\n' +
      'Нажимай на кнопки ниже 👇',
    keyboard: backKeyboard(),
    random_id: getRandomId(),
  });
}

async function handleGameStart(userId, peerId) {
  const secret = Math.floor(Math.random() * 10) + 1;
  gameStates.set(userId, { number: secret, attempts: 3 });
  await vk.api.messages.send({
    peer_id: peerId,
    message:
      '🎲 Я загадал число от *1 до 10*. У тебя 3 попытки!\n' +
      'Нажми на число, которое считаешь правильным:',
    keyboard: gameKeyboard(),
    random_id: getRandomId(),
  });
}

async function handleGameGuess(userId, peerId, guess) {
  const state = gameStates.get(userId);
  if (!state) {
    await vk.api.messages.send({
      peer_id: peerId,
      message: 'Игра не начата. Нажми "Играть" в меню.',
      keyboard: backKeyboard(),
      random_id: getRandomId(),
    });
    return;
  }

  state.attempts--;

  if (guess === state.number) {
    gameStates.delete(userId);
    await vk.api.messages.send({
      peer_id: peerId,
      message: `🎉 Победа! Ты угадал число *${state.number}*! Поздравляю!`,
      keyboard: backKeyboard(),
      random_id: getRandomId(),
    });
    await logAction(userId, 'game_win', `number=${state.number}`);
    return;
  }

  if (state.attempts <= 0) {
    gameStates.delete(userId);
    await vk.api.messages.send({
      peer_id: peerId,
      message: `😢 Попытки закончились. Я загадал число *${state.number}*.`,
      keyboard: backKeyboard(),
      random_id: getRandomId(),
    });
    await logAction(userId, 'game_lose', `number=${state.number}`);
    return;
  }

  const hint = guess < state.number ? '⬆️ Больше' : '⬇️ Меньше';
  await vk.api.messages.send({
    peer_id: peerId,
    message: `${hint}. Осталось попыток: *${state.attempts}*. Попробуй ещё:`,
    keyboard: gameKeyboard(),
    random_id: getRandomId(),
  });
  await logAction(userId, 'game_guess', `guess=${guess}`);
}

async function handleNotesList(userId, peerId) {
  const notes = await getNotes(userId);
  if (notes.length === 0) {
    await vk.api.messages.send({
      peer_id: peerId,
      message: '📭 У тебя пока нет заметок. Добавь первую!',
      keyboard: backKeyboard(),
      random_id: getRandomId(),
    });
    return;
  }
  const list = notes
    .slice(-10) // последние 10
    .map((n, i) => `${i + 1}. ${n.text}`)
    .join('\n');
  await vk.api.messages.send({
    peer_id: peerId,
    message: `📝 *Твои заметки:*\n\n${list}`,
    keyboard: backKeyboard(),
    random_id: getRandomId(),
  });
}

async function handleNotesAdd(userId, peerId) {
  await vk.api.messages.send({
    peer_id: peerId,
    message: '✏️ Напиши заметку следующим сообщением (просто отправь текст):',
    random_id: getRandomId(),
  });
  gameStates.set(`note_${userId}`, { waiting: true });
}

// === ГЛАВНЫЙ ОБРАБОТЧИК ===
vk.updates.on('message_new', async (context) => {
  const { peerId, senderId, text } = context;

  // Если ждём заметку
  if (gameStates.get(`note_${senderId}`)?.waiting) {
    gameStates.delete(`note_${senderId}`);
    await addNote(senderId, text || '(пусто)');
    await vk.api.messages.send({
      peer_id: peerId,
      message: '✅ Заметка сохранена!',
      keyboard: backKeyboard(),
      random_id: getRandomId(),
    });
    await logAction(senderId, 'note_add', text);
    return;
  }

  await logAction(senderId, 'message', text || '');
  await handleMainMenu(peerId);
});

// === ОБРАБОТКА НАЖАТИЙ НА INLINE-КНОПКИ ===
vk.updates.on('message_event', async (context) => {
  const { peerId, userId, payload } = context;
  if (!payload || !payload.cmd) return;

  try {
    switch (payload.cmd) {
      case 'menu':
        await handleMainMenu(peerId);
        break;
      case 'help':
        await handleHelp(peerId);
        break;
      case 'game_start':
        await handleGameStart(userId, peerId);
        break;
      case 'game_guess':
        await handleGameGuess(userId, peerId, payload.number);
        break;
      case 'game_cancel':
        gameStates.delete(userId);
        await vk.api.messages.send({
          peer_id: peerId,
          message: 'Игра отменена.',
          keyboard: backKeyboard(),
          random_id: getRandomId(),
        });
        break;
      case 'notes_list':
        await handleNotesList(userId, peerId);
        break;
      case 'notes_add':
        await handleNotesAdd(userId, peerId);
        break;
    }
    // Отвечаем ВК, что событие обработано
    await context.ok();
  } catch (err) {
    console.error('Ошибка message_event:', err.message);
  }
});

// === WEBHOOK HANDLER ===
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(200).send('ok');
    }
  }

  if (!body) return res.status(200).send('ok');

  if (body.type === 'confirmation') {
    return res.status(200).send(CONFIRMATION_TOKEN);
  }

  try {
    await vk.updates.handleWebhookUpdate(body);
  } catch (err) {
    console.error('VK update error:', err.message);
  }

  res.status(200).send('ok');
};