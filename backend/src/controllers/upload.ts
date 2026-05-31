import { NextFunction, Request, Response } from 'express'; 
import { constants } from 'http2'; 
import BadRequestError from '../errors/bad-request-error'; 
import sharp from 'sharp'; 
import { v4 as uuidv4 } from 'uuid'; 

// Обработчик загрузки файла (изображения)
export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Проверяем, был ли загружен файл через multipart/form-data
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'));
    }

    try {
        const file = req.file; // Извлекаем информацию о загруженном файле

        // Минимально допустимый размер файла — 2 KB
        const MIN_SIZE = 2 * 1024;
        if (file.size < MIN_SIZE) {
            return next(
                new BadRequestError('Файл слишком маленький (минимум 2KB)')
            );
        }

        // Максимально допустимый размер файла — 10 MB
        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return next(
                new BadRequestError('Файл слишком большой (максимум 10MB)')
            );
        }

        // Проверяем, что загруженный файл является изображением (mimetype начинается с 'image/')
        if (!file.mimetype.startsWith('image/')) {
            return next(new BadRequestError('Файл должен быть изображением'));
        }

        let metadata;
        // Получаем метаданные изображения (ширину, высоту, формат и т. д.) с помощью sharp
        try {
            metadata = await sharp(file.path).metadata();
        } catch {
            // Если при получении метаданных произошла ошибка, файл повреждён или не является изображением
            return next(
                new BadRequestError(
                    'Файл повреждён или не является изображением'
                )
            );
        }

        // Убеждаемся, что у изображения есть корректные ширина и высота
        if (!metadata.width || !metadata.height) {
            return next(new BadRequestError('Некорректное изображение'));
        }

        // Формируем путь для сохранения файла: используем переменную окружения UPLOAD_PATH, если она задана
        const fileName = process.env.UPLOAD_PATH
            ? `/${process.env.UPLOAD_PATH}/${file.filename}`
            : file.filename;

        // Возвращаем клиенту статус 201 (создано) и имя файла
        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName,
        });
    } catch (error) {
        // Передаём любую возникшую ошибку в middleware обработки ошибок
        return next(error);
    }
};

export default {};
