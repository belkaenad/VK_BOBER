const { VK, Keyboard, getRandomId } = require('vk-io');

const VK_TOKEN = process.env.VK_TOKEN;
const CONFIRMATION_TOKEN = process.env.VK_CONFIRMATION_TOKEN;

const vk = new VK({
  token: VK_TOKEN,
  apiVersion: '5.199',
});

// === ОТПРАВКА ===
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

function gameKeyboard(secret, attempts) {
  const builder = Keyboard.builder().inline(true);

  builder.callbackButton({ label: '1', payload: { cmd: 'game_guess', guess: 1, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.callbackButton({ label: '2', payload: { cmd: 'game_guess', guess: 2, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.callbackButton({ label: '3', payload: { cmd: 'game_guess', guess: 3, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.row();

  builder.callbackButton({ label: '4', payload: { cmd: 'game_guess', guess: 4, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.callbackButton({ label: '5', payload: { cmd: 'game_guess', guess: 5, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.callbackButton({ label: '6', payload: { cmd: 'game_guess', guess: 6, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.row();

  builder.callbackButton({ label: '7', payload: { cmd: 'game_guess', guess: 7, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.callbackButton({ label: '8', payload: { cmd: 'game_guess', guess: 8, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.callbackButton({ label: '9', payload: { cmd: 'game_guess', guess: 9, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.row();

  builder.callbackButton({ label: '10', payload: { cmd: 'game_guess', guess: 10, secret, attempts }, color: Keyboard.PRIMARY_COLOR });
  builder.callbackButton({ label: '❌ Отмена', payload: { cmd: 'game_cancel' }, color: Keyboard.NEGATIVE_COLOR });

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
    `❌ Неверно! ${hint}. Осталось попыток: *${attemptsLeft}*.\nПопробуй ещё раз:`,
    gameKeyboard(secret, attemptsLeft)
  );
}

async function handleGameCancel(peerId) {
  await send(peerId, '❌ Игра отменена.', backKeyboard());
}