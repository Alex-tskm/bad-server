import { Router } from 'express';
import { celebrate, Joi } from 'celebrate'; 
import {
    createProduct,
    deleteProduct,
    getProducts,
    updateProduct,
} from '../controllers/products'; // Теперь после внешних пакетов
import auth, { roleGuardMiddleware } from '../middlewares/auth';
import {
    validateObjId,
    validateProductBody,
    validateProductUpdateBody,
} from '../middlewares/validations';
import { Role } from '../models/user';

const productRouter = Router();

// Маршрут получения списка продуктов с пагинацией:
// - Валидирует параметры запроса (page, limit) через celebrate/Joi
// - Передаёт управление контроллеру getProducts
productRouter.get(
    '/',
    celebrate({
        query: Joi.object({
            // Параметр page: целое число, минимум 1, по умолчанию 1
            page: Joi.number().integer().min(1).default(1),
            // Параметр limit: целое число от 1 до 50, по умолчанию 5
            limit: Joi.number().integer().min(1).max(50).default(5),
        }),
    }),
    getProducts
);

// Маршрут создания продукта:
// - Требует аутентификации (auth)
// - Валидирует тело запроса через celebrate/Joi: проверяет обязательные поля (title, category), ограничения по длине и формату
// - Проверяет, что пользователь имеет роль Admin (roleGuardMiddleware)
// - Дополнительно применяет кастомную валидацию validateProductBody
// - Передаёт управление контроллеру createProduct
productRouter.post(
    '/',
    auth,
    celebrate({
        body: Joi.object({
            // Название продукта: обязательная строка от 2 до 30 символов
            title: Joi.string().min(2).max(30).required(),
            // Описание продукта: строка длиной до 1000 символов, допускается пустая строка
            description: Joi.string().max(1000).allow(''),
            // Категория: обязательная строка
            category: Joi.string().required(),
            // Цена: число не меньше 0, допускается null
            price: Joi.number().min(0).allow(null),
            // Объект с информацией об изображении
            image: Joi.object({
                // Имя файла: обязательная строка, разрешены только буквы, цифры и символы _.-
                fileName: Joi.string()
                    .pattern(/^[a-zA-Z0-9._-]+$/)
                    .required(),
                // Оригинальное имя файла: произвольная строка (необязательное поле)
                originalName: Joi.string(),
            }),
        }).unknown(false), // Запрещает передачу полей, не описанных в схеме
    }),
    roleGuardMiddleware(Role.Admin), // Проверяет, что у пользователя роль Admin
    validateProductBody, // Дополнительная кастомная валидация тела запроса
    createProduct
);

// Маршрут удаления продукта:
// - Требует аутентификации (auth)
// - Проверяет, что пользователь имеет роль Admin (roleGuardMiddleware)
// - Валидирует ID продукта (validateObjId) — проверяет формат ObjectId MongoDB
// - Передаёт управление контроллеру deleteProduct
productRouter.delete(
    '/:productId',
    auth,
    roleGuardMiddleware(Role.Admin),
    validateObjId,
    deleteProduct
);

// Маршрут обновления продукта:
// - Требует аутентификации (auth)
// - Проверяет, что пользователь имеет роль Admin (roleGuardMiddleware)
// - Валидирует ID продукта (validateObjId)
// - Применяет кастомную валидацию для тела запроса на обновление (validateProductUpdateBody)
// - Передаёт управление контроллеру updateProduct
productRouter.patch(
    '/:productId',
    auth,
    roleGuardMiddleware(Role.Admin),
    validateObjId,
    validateProductUpdateBody,
    updateProduct
);

export default productRouter; // Экспортируем маршрутизатор для подключения в основном приложении
