const { VK, Keyboard, getRandomId } = require('vk-io');

const VK_TOKEN = process.env.VK_TOKEN;
const CONFIRMATION_TOKEN = process.env.VK_CONFIRMATION_TOKEN;

const vk = new VK({
  token: VK_TOKEN,
  apiVersion: '5.199',
});

// === ОТПРАВКА СООБЩЕНИЯ С ЛОГИРОВАНИЕМ ===
async function send(peerId, message, keyboard) {
  const payload = {
    peer_id: peerId,
    message,
    random_id: getRandomId(),
  };
  
  if (keyboard) {
    payload.keyboard = keyboard;
  }
  
  console.log(`📤 [SEND] peerId=${peerId} | message="${message.substring(0, 50)}..." | hasKeyboard=${!!keyboard}`);
  
  try {
    const result = await vk.api.messages.send(payload);
    console.log(`✅ [SEND OK] messageId=${result}`);
    return result;
  } catch (err) {
    console.error(`❌ [SEND ERROR] peerId=${peerId} | error=${err.message}`);
    throw err;
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

function gameKeyboard(secret, attempts) {
  const builder = Keyboard.builder().inline(true);
  for (let i = 1; i <= 5; i++) {
    builder.textButton({
      label: String(i),
      payload: { cmd: 'game_guess', guess: i, secret, attempts },
      color: Keyboard.PRIMARY_COLOR,
    });
  }
  builder.row();
  for (let i = 6; i <= 10; i++) {
    builder.textButton({
      label: String(i),
      payload: { cmd: 'game_guess', guess: i, secret, attempts },
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
  console.log(`🏠 [HANDLER] handleMainMenu | peerId=${peerId}`);
  await send(peerId, '👋 Главное меню. Что хочешь сделать?', mainMenuKeyboard());
}

async function handleHelp(peerId) {
  console.log(`ℹ️ [HANDLER] handleHelp | peerId=${peerId}`);
  await send(
    peerId,
    '🤖 *Что я умею:*\n\n🎮 *Угадай число* — загадаю число от 1 до 10, у тебя 3 попытки!\n🎲 *Случайное число* — выдам рандомное число\n\nНажимай на кнопки 👇',
    backKeyboard()
  );
}

async function handleRandom(peerId) {
  console.log(`🎲 [HANDLER] handleRandom | peerId=${peerId}`);
  const num = Math.floor(Math.random() * 100) + 1;
  await send(peerId, `🎲 Твоё случайное число: *${num}*`, backKeyboard());
}

async function handleGameStart(peerId) {
  const secret = Math.floor(Math.random() * 10) + 1;
  const attempts = 3;
  console.log(`🎮 [HANDLER] handleGameStart | secret=${secret} | peerId=${peerId}`);
  await send(
    peerId,
    '🎲 Я загадал число от *1 до 10*. У тебя 3 попытки!\nНажми на число:',
    gameKeyboard(secret, attempts)
  );
}

async function handleGameGuess(peerId, payload) {
  const { guess, secret, attempts } = payload;
  console.log(`🎮 [HANDLER] handleGameGuess | guess=${guess} | secret=${secret} | attempts=${attempts}`);

  if (guess === secret) {
    console.log(`🎉 [GAME WIN] peerId=${peerId} | secret=${secret}`);
    await send(peerId, `🎉 Победа! Ты угадал число *${secret}*!`, backKeyboard());
    return;
  }

  const attemptsLeft = attempts - 1;
  if (attemptsLeft <= 0) {
    console.log(`😢 [GAME LOSE] peerId=${peerId} | secret=${secret}`);
    await send(peerId, `😢 Попытки закончились. Я загадал число *${secret}*.`, backKeyboard());
    return;
  }

  const hint = guess < secret ? '⬆️ Больше' : '⬇️ Меньше';
  console.log(`💡 [GAME HINT] ${hint} | attemptsLeft=${attemptsLeft}`);
  await send(
    peerId,
    `${hint}. Осталось попыток: *${attemptsLeft}*`,
    gameKeyboard(secret, attemptsLeft)
  );
}

// === НОВОЕ СООБЩЕНИЕ ===
vk.updates.on('message_new', async (context) => {
  console.log('═'.repeat(60));
  console.log(`📨 [message_new] ПОЛУЧЕНО СООБЩЕНИЕ`);
  console.log(`   peerId=${context.peerId} | senderId=${context.senderId}`);
  console.log(`   text="${context.text}"`);
  console.log(`   payload=${JSON.stringify(context.payload)}`);
  console.log('═'.repeat(60));
  
  await handleMainMenu(context.peerId);
});

// === НАЖАТИЕ НА INLINE-КНОПКУ ===
vk.updates.on('message_event', async (context) => {
  console.log('═'.repeat(60));
  console.log(`🔘 [message_event] НАЖАТИЕ КНОПКИ`);
  console.log(`   peerId=${context.peerId} | userId=${context.userId}`);
  console.log(`   eventId=${context.eventId}`);
  console.log(`   payload=${JSON.stringify(context.payload)}`);
  console.log('═'.repeat(60));

  const { peerId, payload } = context;
  
  if (!payload) {
    console.log('❌ [ERROR] payload отсутствует');
    return;
  }
  
  if (!payload.cmd) {
    console.log(`❌ [ERROR] payload.cmd отсутствует | payload=${JSON.stringify(payload)}`);
    return;
  }

  console.log(`⚙️ [PROCESSING] cmd=${payload.cmd}`);

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
        await handleGameStart(peerId);
        break;
      case 'game_guess':
        await handleGameGuess(peerId, payload);
        break;
      case 'game_cancel':
        console.log(`❌ [GAME CANCEL] peerId=${peerId}`);
        await send(peerId, 'Игра отменена.', backKeyboard());
        break;
      default:
        console.log(`⚠️ [UNKNOWN CMD] cmd=${payload.cmd}`);
        await send(peerId, 'Неизвестная команда.', backKeyboard());
    }
  } catch (err) {
    console.error('❌ [HANDLER ERROR]', err.message);
    console.error(err.stack);
  }
});

// === WEBHOOK ===
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    console.log('⚠️ [WEBHOOK] Не POST запрос');
    return res.status(405).send('Method Not Allowed');
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      console.error('❌ [WEBHOOK] Ошибка парсинга JSON');
      return res.status(200).send('ok');
    }
  }

  if (!body) {
    console.log('⚠️ [WEBHOOK] Пустое тело запроса');
    return res.status(200).send('ok');
  }

  console.log('═'.repeat(60));
  console.log(`📦 [WEBHOOK] ВХОДЯЩИЙ ЗАПРОС`);
  console.log(`   type=${body.type} | group_id=${body.group_id}`);
  console.log(`   object=${JSON.stringify(body.object || {}).substring(0, 200)}...`);
  console.log('═'.repeat(60));

  if (body.type === 'confirmation') {
    console.log('✅ [WEBHOOK] Отправка токена подтверждения');
    return res.status(200).send(CONFIRMATION_TOKEN);
  }

  try {
    await vk.updates.handleWebhookUpdate(body);
    console.log('✅ [WEBHOOK] Событие успешно обработано');
  } catch (err) {
    console.error('❌ [WEBHOOK ERROR]', err.message);
    console.error(err.stack);
  }

  res.status(200).send('ok');
};