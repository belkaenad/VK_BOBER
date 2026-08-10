import { VK, getRandomId } from 'vk-io';

console.log('🟢 [INIT] Скрипт запущен, инициализируем vk-io...');

// Проверяем, есть ли токен в переменных окружения
if (!process.env.VK_TOKEN) {
    console.error('🔴 [ENV] КРИТИЧЕСКАЯ ОШИБКА: Переменная VK_TOKEN не найдена в настройках Vercel!');
}

const vk = new VK({
    token: process.env.VK_TOKEN,
    apiVersion: '5.199', // Указываем свежую версию API
});

vk.updates.on('message_new', async (context) => {
    console.log(`📩 [MESSAGE] Пришло сообщение от ID ${context.senderId}: "${context.text}"`);
    
    try {
        if (context.text && context.text.toLowerCase() === 'привет') {
            console.log('⚙️ [ACTION] Условие выполнено, отправляем ответ...');
            
            await context.send({
                message: 'Привет! Я работаю на Vercel 🚀',
                // ⚠️ ОБЯЗАТЕЛЬНО! Без random_id ВКонтакте отклонит отправку сообщения
                random_id: getRandomId(), 
            });
            
            console.log('✅ [ACTION] Ответ успешно отправлен в ВК!');
        } else {
            console.log('ℹ️ [ACTION] Сообщение не подходит под фильтр "привет".');
        }
    } catch (sendError) {
        // Сюда попадем, если ВК отклонил сообщение (например, нет прав или нет random_id)
        console.error('❌ [SEND ERROR] Ошибка при попытке отправить сообщение:', sendError.message || sendError);
    }
});

export default async function handler(req, res) {
    console.log('🚨 [REQUEST] --- Новый запрос от серверов ВК ---');
    
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    let body = req.body;

    // Vercel иногда присылает body как строку, а не как объект. Парсим на всякий случай.
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
            console.log('🔄 [BODY] Тело успешно распарсено из строки в JSON');
        } catch (e) {
            console.error('❌ [ERROR] Не удалось распарсить JSON из строки');
        }
    }

    if (!body) {
        console.error('❌ [ERROR] Тело запроса пустое!');
        return res.status(200).send('ok');
    }

    console.log(`📦 [BODY] Тип события: ${body.type}`);

    // 1. Обработка подтверждения сервера
    if (body.type === 'confirmation') {
        console.log('✅ [CONFIRMATION] ВК запросил подтверждение адреса. Отправляем строку.');
        // Убедитесь, что строка ниже ТОЧНО совпадает с той, что показывает ВК в настройках!
        return res.status(200).send("2a6b470d"); 
    }

    // 2. Передаем событие в vk-io
    try {
        console.log('⚙️ [VK-IO] Передаем событие в handleWebhookUpdate...');
        await vk.updates.handleWebhookUpdate(body);
        console.log('✅ [VK-IO] Событие успешно обработано библиотекой vk-io.');
        
        res.status(200).send('ok'); 
    } catch (error) {
        // Сюда попадем, если vk-io не смог переварить JSON от ВК
        console.error('❌ [VK-IO ERROR] Ошибка внутри vk-io:', error.message || error);
        res.status(200).send('ok'); 
    }
}