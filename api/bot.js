const { VK, Keyboard, getRandomId } = require('vk-io');

const VK_TOKEN = process.env.VK_TOKEN;
const CONFIRMATION_TOKEN = process.env.VK_CONFIRMATION_TOKEN;

const vk = new VK({
  token: VK_TOKEN,
  apiVersion: '5.199',
});

// === ОТПРАВКА С ЛОГАМИ ===
async function send(peerId, message, keyboard) {
  const payload = { peer_id: peerId, message, random_id: getRandomId() };
  if (keyboard) payload.keyboard = keyboard;

  console.log(`📤 [SEND] peerId=${peerId} | message="${message.substring(0, 50)}..."`);
  try {
    const result = await vk.api.messages.send(payload);
    console.log(`✅ [SEND OK] messageId=${result}`);
    return result;
  } catch (err) {
    console.error(`❌ [SEND ERROR] ${err.message}`);
  }
}

// === "ЗАКРЫТИЕ" CALLBACK-КНОПКИ (вместо context.ok()) ===
async function answerEvent(context, text = '✅ Готово') {
  try {
    await vk.api.messages.sendMessageEventAnswer({
      event_id: context.eventId,
      user_id: context.userId,
      peer_id: context.peerId,
      event_data: JSON.stringify({ type: 'show_snackbar', text }),
    });
  } catch (e) {
    console.error('Ошибка ответа на событие:', e.message);
  }
}

// === КЛАВИАТУРЫ ===
function mainMenuKeyboard() {
  return Keyboard.builder()
    .inline(true)
    .callbackButton({
      label: '🎮 Играть в "Угадай число"',
      payload: { cmd: 'game_start' },
      color: Keyboard.POSITIVE_COLOR,
    })
    .row()
    .callbackButton({
      label: '🎲 Случайное число',
      payload: { cmd: 'random' },
      color: Keyboard.PRIMARY_COLOR,
    })
    .row()
    .callbackButton({
      label: 'ℹ️ Что я умею?',
      payload: { cmd: 'help' },
      color: Keyboard.SECONDARY_COLOR,
    });
}

// ИСПРАВЛЕНО: максимум 4 кнопки в строке!
function gameKeyboard(secret, attempts) {
  const builder = Keyboard.builder().inline(true);

  // Ряд 1: цифры 1-4
  for (let i = 1; i <= 4; i++) {
    builder.callbackButton({
      label: String(i),
      payload: { cmd: 'game_guess', guess: i, secret, attempts },
      color: Keyboard.PRIMARY_COLOR,
    });
  }
  builder.row();

  // Ряд 2: цифры 5-8
  for (let i = 5; i <= 8; i++) {
    builder.callbackButton({
      label: String(i),
      payload: { cmd: 'game_guess', guess: i, secret, attempts },
      color: Keyboard.PRIMARY_COLOR,
    });
  }
  builder.row();

  // Ряд 3: цифры 9-10
  builder.callbackButton({
    label: '9',
    payload: { cmd: 'game_guess', guess: 9, secret, attempts },
    color: Keyboard.PRIMARY_COLOR,
  });
  builder.callbackButton({
    label: '10',
    payload: { cmd: 'game_guess', guess: 10, secret, attempts },
    color: Keyboard.PRIMARY_COLOR,
  });
  builder.row();

  // Ряд 4: отмена
  builder.callbackButton({
    label: '❌ Отмена',
    payload: { cmd: 'game_cancel' },
    color: Keyboard.NEGATIVE_COLOR,
  });

  return builder;
}

function backKeyboard() {
  return Keyboard.builder()
    .inline(true)
    .callbackButton({
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
    '🤖 *Что я умею:*\n\n🎮 *Угадай число* — загадаю число от 1 до 10, у тебя 3 попытки!\n🎲 *Случайное число* — выдам рандом\n\nНажимай на кнопки 👇',
    backKeyboard()
  );
}

async function handleRandom(peerId) {
  const num = Math.floor(Math.random() * 100) + 1;
  await send(peerId, `🎲 Твоё случайное число: *${num}*`, backKeyboard());
}

async function handleGameStart(peerId) {
  const secret = Math.floor(Math.random() * 10) + 1;
  const attempts = 3;
  console.log(`🎮 [GAME START] secret=${secret} | peerId=${peerId}`);
  await send(
    peerId,
    '🎲 Я загадал число от *1 до 10*. У тебя 3 попытки!\nНажми на число:',
    gameKeyboard(secret, attempts)
  );
}

async function handleGameGuess(peerId, cmdPayload) {
  const { guess, secret, attempts } = cmdPayload;
  console.log(`🎮 [GAME GUESS] guess=${guess} | secret=${secret} | attempts=${attempts}`);

  if (guess === secret) {
    await send(peerId, `🎉 Победа! Ты угадал число *${secret}*!`, backKeyboard());
    return;
  }

  const attemptsLeft = attempts - 1;
  if (attemptsLeft <= 0) {
    await send(peerId, `😢 Попытки закончились. Я загадал число *${secret}*.`, backKeyboard());
    return;
  }

  const hint = guess < secret ? '⬆️ Больше' : '⬇️ Меньше';
  await send(
    peerId,
    `${hint}. Осталось попыток: *${attemptsLeft}*`,
    gameKeyboard(secret, attemptsLeft)
  );
}

// === ОБЩИЙ ОБРАБОТЧИК КОМАНД ===
async function handleCommand(peerId, userId, cmdPayload) {
  console.log(`⚙️ [COMMAND] cmd=${cmdPayload.cmd}`);

  try {
    switch (cmdPayload.cmd) {
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
        await handleGameStart(peerId);
        break;
      case 'game_guess':
        await handleGameGuess(peerId, cmdPayload);
        break;
      case 'game_cancel':
        await send(peerId, 'Игра отменена.', backKeyboard());
        break;
      default:
        console.log(`⚠️ [UNKNOWN] cmd=${cmdPayload.cmd}`);
    }
  } catch (err) {
    console.error('❌ [COMMAND ERROR]', err.message);
  }
}

// === НОВОЕ СООБЩЕНИЕ ===
vk.updates.on('message_new', async (context) => {
  console.log('═'.repeat(60));
  console.log(`📨 [message_new] peerId=${context.peerId} | senderId=${context.senderId}`);
  console.log(`   text="${context.text}"`);
  console.log('═'.repeat(60));

  const cmdPayload = context.messagePayload;

  if (cmdPayload && cmdPayload.cmd) {
    await handleCommand(context.peerId, context.senderId, cmdPayload);
    return;
  }

  await handleMainMenu(context.peerId);
});

// === НАЖАТИЕ НА CALLBACK-КНОПКУ ===
vk.updates.on('message_event', async (context) => {
  console.log('═'.repeat(60));
  console.log(`🔘 [message_event] peerId=${context.peerId} | userId=${context.userId}`);
  console.log(`   eventId=${context.eventId}`);
  console.log('═'.repeat(60));

  const cmdPayload = context.eventPayload;

  if (!cmdPayload || !cmdPayload.cmd) {
    console.log(`❌ [message_event] Нет payload кнопки`);
    return;
  }

  await handleCommand(context.peerId, context.userId, cmdPayload);

  // ИСПРАВЛЕНО: закрываем кнопку через API (вместо context.ok())
  await answerEvent(context, '✅');
});

// === WEBHOOK ===
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(200).send('ok'); }
  }
  if (!body) return res.status(200).send('ok');

  console.log(`📦 [WEBHOOK] type=${body.type} | group_id=${body.group_id}`);

  if (body.type === 'confirmation') {
    return res.status(200).send(CONFIRMATION_TOKEN);
  }

  try {
    await vk.updates.handleWebhookUpdate(body);
  } catch (err) {
    console.error('❌ [WEBHOOK ERROR]', err.message);
  }

  res.status(200).send('ok');
};