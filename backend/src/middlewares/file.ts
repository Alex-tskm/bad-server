import { Request, Express } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { mkdirSync } from 'fs';
import path, { join } from 'path';
// eslint-disable-next-line import/no-unresolved
import { v4 as uuidv4 } from 'uuid';

// Определяем типы для колбэков Multer:
// DestinationCallback — для указания пути сохранения файла
type DestinationCallback = (error: Error | null, destination: string) => void;
// FileNameCallback — для формирования имени файла при сохранении
type FileNameCallback = (error: Error | null, filename: string) => void;

// Настраиваем хранилище для Multer: определяем, куда и под каким именем сохранять файлы
const storage = multer.diskStorage({
    // Функция определения пути сохранения файла
    destination: (
        _req: Request, // Объект запроса (не используется в данной реализации)
        _file: Express.Multer.File, // Объект загруженного файла (не используется)
        cb: DestinationCallback // Колбэк для передачи результата (ошибки или пути)
    ) => {
        // Формируем путь к директории для сохранения файлов:
        // - Если в переменных окружения задана UPLOAD_PATH_TEMP, используем её как поддиректорию в public
        // - Иначе сохраняем напрямую в public
        const destinationPath = join(
            __dirname,
            process.env.UPLOAD_PATH_TEMP
                ? `../public/${process.env.UPLOAD_PATH_TEMP}`
                : '../public'
        );

        // Создаём директорию, если её не существует (recursive: true позволяет создавать вложенные папки)
        mkdirSync(destinationPath, { recursive: true });

        // Передаём путь сохранения в колбэк (без ошибки — null)
        cb(null, destinationPath);
    },

    // Функция формирования имени файла
    filename: (
        _req: Request, // Объект запроса (не используется)
        file: Express.Multer.File, // Объект загруженного файла (нужен для получения расширения)
        cb: FileNameCallback // Колбэк для передачи имени файла
    ) => {
        // Извлекаем расширение исходного файла (например, .jpg, .png)
        const ext = path.extname(file.originalname);
        // Генерируем безопасное уникальное имя файла: UUID + исходное расширение
        const safeName = `${uuidv4()}${ext}`;

        // Передаём сгенерированное имя в колбэк (без ошибки)
        cb(null, safeName);
    },
});

// Список разрешённых MIME-типов для загружаемых файлов (только изображения)
const types = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
];

// Функция фильтрации файлов: проверяет, соответствует ли MIME-тип файла разрешённому списку
const fileFilter = (
    _req: Request, // Объект запроса (не используется)
    file: Express.Multer.File, // Объект загружаемого файла (содержит MIME-тип и другие метаданные)
    cb: FileFilterCallback // Колбэк для разрешения/запрета загрузки
) => {
    // Если MIME-тип файла не входит в список разрешённых — отклоняем загрузку (false)
    if (!types.includes(file.mimetype)) {
        return cb(null, false);
    }

    // Иначе разрешаем загрузку (true)
    return cb(null, true);
};

// Экспортируем настроенную конфигурацию Multer (хранилище + фильтр файлов) для использования в маршрутах
export default multer({ storage, fileFilter });
