// Файл: /api/webhook.js (или .ts)
import { VK } from 'vk-io';

// Инициализируем VK (это происходит при каждом холодном старте функции)
const vk = new VK({
    token: process.env.VK_TOKEN,
});

// Регистрируем обработчики событий
vk.updates.on('message_new', async (context) => {
    if (context.text === 'Привет') {
        await context.send('Привет! Я работаю на Vercel 🚀');
    }
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const body = req.body;

    // 1. Обработка подтверждения сервера (требует ВК при первом добавлении URL)
    if (body.type === 'confirmation') {
        return res.status(200).send("8203be3a");
    }

    // // 2. Защита: проверяем секретный ключ, чтобы никто не мог слать вам фейковые события
    // if (body.secret !== process.env.VK_SECRET_KEY) {
    //     return res.status(403).send('Forbidden');
    // }

    // 3. Передаем событие в vk-io
    try {
        await vk.updates.handleWebhookUpdate(body);
        // ВКонтакте требует отвечать 200 OK, иначе он будет спамить повторными запросами
        res.status(200).send('ok'); 
    } catch (error) {
        console.error('VK Update Error:', error);
        res.status(200).send('ok'); // Отвечаем 200 даже при ошибке, чтобы ВК не повторил запрос
    }
}