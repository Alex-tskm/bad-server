import { errors } from 'celebrate'; 
import cookieParser from 'cookie-parser'; 
import cors from 'cors'; 
import 'dotenv/config'; 
import express, { json, urlencoded } from 'express'; 
import mongoose from 'mongoose'; 
import path from 'path'; 
import { DB_ADDRESS } from './config'; 
import errorHandler from './middlewares/error-handler'; 
import serveStatic from './middlewares/serverStatic'; 
import routes from './routes'; 
import rateLimit from 'express-rate-limit'; 

const { PORT = 3000 } = process.env; // Извлечение порта для сервера из переменных окружения, по умолчанию — 3000
const app = express(); // Создание экземпляра приложения Express

// Настройка middleware для ограничения частоты запросов:
// окно — 1 минута, максимум 50 запросов, кастомное сообщение при превышении лимита
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 минута (в миллисекундах)
    max: 50, // максимальное количество запросов в указанное окно
    message: 'Слишком много запросов. Попробуйте позже', // сообщение, возвращаемое клиенту при превышении лимита
});

app.use(limiter); // Подключение middleware для ограничения запросов ко всем маршрутам приложения
app.use(cookieParser()); // Подключение middleware для парсинга cookies

// Настройка CORS: разрешаем запросы с источника, указанного в ORIGIN_ALLOW, и разрешаем передачу credentials (например, cookies)
app.use(cors({ origin: process.env.ORIGIN_ALLOW, credentials: true }));
// Закомментированная строка app.use(cors()) — вариант без параметров, разрешает запросы со всех источников (небезопасно для продакшена)

// Раздача статических файлов из директории 'public' с использованием встроенного middleware Express
app.use(express.static(path.join(__dirname, 'public')));

// Раздача статических файлов через кастомное middleware serveStatic из той же директории 'public'
// Внимание: это дублирование функционала, возможно, избыточно
app.use(serveStatic(path.join(__dirname, 'public')));

// Подключение middleware для парсинга URL-encoded тел запросов (например, данных из HTML-форм)
app.use(urlencoded({ extended: true }));
// Подключение middleware для парсинга JSON-тел запросов
app.use(json());

// Обработка preflight OPTIONS-запросов для CORS — разрешает все маршруты для предварительных запросов
app.options('*', cors());

// Подключение всех маршрутов приложения (основные API endpoints)
app.use(routes);
// Подключение middleware от celebrate для форматирования и обработки ошибок валидации
app.use(errors());
// Подключение кастомного обработчика ошибок (должен быть последним в цепочке middleware)
app.use(errorHandler);

// eslint-disable-next-line no-console
// Асинхронная функция для инициализации приложения: подключение к БД и запуск сервера
const bootstrap = async () => {
    try {
        // Подключение к базе данных MongoDB по строке подключения из конфигурации
        await mongoose.connect(DB_ADDRESS);
        // Запуск сервера на указанном порту; при успешном старте выводится сообщение 'ok'
        await app.listen(PORT, () => console.log('ok'));
    } catch (error) {
        // При возникновении ошибки (например, проблемы с подключением к БД или занятом порту) — вывод ошибки в консоль
        console.error(error);
    }
};

// Запуск инициализации приложения (подключение к БД и старт сервера)
bootstrap();
