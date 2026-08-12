const { VK, getRandomId } = require('vk-io');

const vk = new VK({ token: process.env.VK_TOKEN });

module.exports = async (req, res) => {
  // Защита: принимаем запросы только от Vercel Cron
  if (
    process.env.CRON_SECRET &&
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).send('Unauthorized');
  }

  console.log('⏰ [CRON] Сработало расписание!');

  try {
    await vk.api.messages.send({
      peer_id: 364029837, // ID вашего чата/пользователя
      message: '⏰ Привет! Это запланированное сообщение от бота.',
      random_id: getRandomId(),
    });
    console.log('✅ [CRON] Сообщение отправлено');
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ [CRON ERROR]', err.message);
    res.status(500).json({ ok: false });
  }
};