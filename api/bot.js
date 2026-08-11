const { VK, Keyboard, getRandomId } = require('vk-io');

// === НАСТРОЙКИ ===
const VK_TOKEN = process.env.VK_TOKEN;
const CONFIRMATION_TOKEN = "c20dfc20"

// === ИНИЦИАЛИЗАЦИЯ VK ===
const vk = new VK({
  token: VK_TOKEN,
  apiVersion: '5.199',
});

// Состояние игры: userId -> { number, attempts }
const gameStates = new Map();

// === ВСПОМОГАТЕЛЬНАЯ ОТПРАВКА ===
async function send(peerId, message, keyboard) {
  await vk.api.messages.send({
    peer_id: peerId,
    message,
    random_id: getRandomId(),
    ...(keyboard ? { keyboard } : {}),
  });
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
      label: '🎲 Случайное число',
      payload: { cmd: 'random' },
      color: Keyboard.PRIMARY_COLOR,
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
  await send(peerId, '👋 Главное меню. Что хочешь сделать?', mainMenuKeyboard());
}

async function handleHelp(peerId) {
  await send(
    peerId,
    '🤖 *Что я умею:*\n\n' +
      '🎮 *Угадай число* — я загадаю число от 1 до 10, у тебя 3 попытки!\n' +
      '🎲 *Случайное число* — просто выдам рандомное число\n\n' +
      'Нажимай на кнопки 👇',
    backKeyboard()
  );
}

async function handleRandom(peerId) {
  const num = Math.floor(Math.random() * 100) + 1;
  await send(peerId, `🎲 Твоё случайное число: *${num}*`, backKeyboard());
}

async function handleGameStart(userId, peerId) {
  const secret = Math.floor(Math.random() * 10) + 1;
  gameStates.set(userId, { number: secret, attempts: 3 });
  await send(
    peerId,
    '🎲 Я загадал число от *1 до 10*. У тебя 3 попытки!\nНажми на число:',
    gameKeyboard()
  );
}

async function handleGameGuess(userId, peerId, guess) {
  const state = gameStates.get(userId);

  if (!state) {
    await send(peerId, 'Игра не начата. Нажми "Играть" в меню.', backKeyboard());
    return;
  }

  state.attempts--;

  if (guess === state.number) {
    gameStates.delete(userId);
    await send(peerId, `🎉 Победа! Ты угадал число *${state.number}*!`, backKeyboard());
    return;
  }

  if (state.attempts <= 0) {
    gameStates.delete(userId);
    await send(peerId, `😢 Попытки закончились. Я загадал число *${state.number}*.`, backKeyboard());
    return;
  }

  const hint = guess < state.number ? '⬆️ Больше' : '⬇️ Меньше';
  await send(peerId, `${hint}. Осталось попыток: *${state.attempts}*`, gameKeyboard());
}

// === НОВОЕ СООБЩЕНИЕ ===
vk.updates.on('message_new', async (context) => {
  await handleMainMenu(context.peerId);
});

// === НАЖАТИЕ НА INLINE-КНОПКУ ===
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
      case 'random':
        await handleRandom(peerId);
        break;
      case 'game_start':
        await handleGameStart(userId, peerId);
        break;
      case 'game_guess':
        await handleGameGuess(userId, peerId, payload.number);
        break;
      case 'game_cancel':
        gameStates.delete(userId);
        await send(peerId, 'Игра отменена.', backKeyboard());
        break;
    }
  } catch (err) {
    console.error('Ошибка обработки кнопки:', err.message);
  }
});

// === WEBHOOK ===
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

  // Подтверждение сервера для ВК
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