import { Joi, celebrate } from 'celebrate'; 
import { Types } from 'mongoose'; 

// Регулярное выражение для валидации номера телефона: допускает +, цифры, пробелы, скобки и дефисы в разумных комбинациях
export const phoneRegExp = /^(\+\d+)?(?:\s|-?|\(?\d+\)?)+$/;

// Перечисление допустимых способов оплаты
export enum PaymentType {
    Card = 'card',    // Оплата картой
    Online = 'online', // Онлайн-оплата (например, через платёжные системы)
}

// Валидатор для тела запроса при создании заказа
// Проверяет корректность данных: список товаров (ObjectId), способ оплаты, email, телефон, адрес и т. д.
export const validateOrderBody = celebrate({
    body: Joi.object().keys({
        // Массив ID товаров (должны быть валидными ObjectId MongoDB)
        items: Joi.array()
            .items(
                Joi.string().custom((value, helpers) => {
                    // Проверяем, является ли строка валидным ObjectId
                    if (Types.ObjectId.isValid(value)) {
                        return value;
                    }
                    // Если нет — возвращаем кастомное сообщение об ошибке
                    return helpers.message({ custom: 'Невалидный id' });
                })
            )
            .messages({
                'array.empty': 'Не указаны товары', // Ошибка, если массив товаров пуст
            }),
        // Поле payment: обязательная строка, значение должно быть одним из PaymentType
        payment: Joi.string()
            .valid(...Object.values(PaymentType)) // Допустимые значения: 'card' или 'online'
            .required()
            .messages({
                'string.valid':
                    'Указано невалидное значение для способа оплаты. Возможные значения — "card", "online"',
                'string.empty': 'Не указан способ оплаты',
            }),
        // Поле email: обязательная строка в формате email
        email: Joi.string().email().required().messages({
            'string.empty': 'Не указан email',
        }),
        // Поле phone: обязательная строка, соответствующая шаблону номера телефона
        phone: Joi.string()
            .pattern(/^\+?[0-9\s()-]{7,20}$/) // Допускаются +, цифры, пробелы, скобки, дефисы; длина 7–20 символов
            .required(),
        // Поле address: обязательная строка (адрес доставки)
        address: Joi.string().required(),
        // Поле total: обязательное число (общая сумма заказа)
        total: Joi.number().required().messages({
            'string.empty': 'Не указана сумма заказа',
        }),
        // Поле comment: необязательная строка длиной до 500 символов (допускаются пустые значения)
        comment: Joi.string().max(500).allow(''),
    }),
});

// Валидатор для создания нового товара
// Проверяет обязательные поля: title, image, category, description; цена — необязательна
export const validateProductBody = celebrate({
    body: Joi.object().keys({
        // Название товара: обязательная строка от 2 до 30 символов
        title: Joi.string().required().min(2).max(30).messages({
            'string.min': 'Минимальная длина поля "name" — 2',
            'string.max': 'Максимальная длина поля "name" — 30',
            'string.empty': 'Поле "title" должно быть заполнено',
        }),
        // Объект с информацией об изображении: оба поля обязательны
        image: Joi.object().keys({
            fileName: Joi.string().required(),      // Имя файла на сервере
            originalName: Joi.string().required(),  // Оригинальное имя файла
        }),
        // Категория товара: обязательная строка
        category: Joi.string().required().messages({
            'string.empty': 'Поле "category" должно быть заполнено',
        }),
        // Описание товара: обязательная строка
        description: Joi.string().required().messages({
            'string.empty': 'Поле "description" должно быть заполнено',
        }),
        // Цена товара: число, допускается null
        price: Joi.number().allow(null),
    }),
});

// Валидатор для обновления товара
// В отличие от validateProductBody, большинство полей необязательны (кроме fileName и originalName в объекте image)
export const validateProductUpdateBody = celebrate({
    body: Joi.object().keys({
        // Название товара: строка от 2 до 30 символов (необязательное поле)
        title: Joi.string().min(2).max(30).messages({
            'string.min': 'Минимальная длина поля "name" — 2',
            'string.max': 'Максимальная длина поля "name" — 30',
        }),
        // Объект с информацией об изображении: оба поля обязательны
        image: Joi.object().keys({
            fileName: Joi.string().required(),
            originalName: Joi.string().required(),
        }),
        // Категория: необязательная строка
        category: Joi.string(),
        // Описание: необязательная строка
        description: Joi.string(),
        // Цена: число, допускается null
        price: Joi.number().allow(null),
    }),
});

// Валидатор для проверки ObjectId в параметрах запроса (например, productId)
// Используется в маршрутах, где требуется ID документа MongoDB
export const validateObjId = celebrate({
    params: Joi.object().keys({
        productId: Joi.string()
            .required() // Поле обязательно для заполнения
            .custom((value, helpers) => {
                // Проверяем валидность ObjectId
                if (Types.ObjectId.isValid(value)) {
                    return value;
                }
                // Если ID невалиден — возвращаем сообщение об ошибке
                return helpers.message({ any: 'Невалидный id' });
            }),
    }),
});

// Валидатор для данных пользователя при регистрации/обновлении
// Проверяет name (2–30 символов), обязательный пароль (минимум 6 символов) и email
export const validateUserBody = celebrate({
    body: Joi.object().keys({
        // Имя пользователя: строка от 2 до 30 символов (необязательное поле)
        name: Joi.string().min(2).max(30).messages({
            'string.min': 'Минимальная длина поля "name" — 2',
            'string.max': 'Максимальная длина поля "name" — 30',
        }),
        // Пароль: обязательная строка минимум из 6 символов
        password: Joi.string().min(6).required().messages({
            'string.empty': 'Поле "password" должно быть заполнено',
        }),
        // Email: обязательная строка в формате email
        email: Joi.string()
            .required()
            .email()
            .message('Поле "email" должно быть валидным email-адресом')
            .messages({
                'string.empty': 'Поле "email" должно быть заполнено',
            }),
    }),
});

// Валидатор для аутентификации (вход в систему)
// Проверяет email и пароль — оба поля обязательны
export const validateAuthentication = celebrate({
    body: Joi.object().keys({
        // Email: обязательная строка в формате email
        email: Joi.string()
            .required()
            .email()
            .message('Поле "email" должно быть валидным email-адресом')
            .messages({
                'string.required': 'Поле "email" должно быть заполнено',
            }),
        // Пароль: обязательная строка
        password: Joi.string().required().messages({
            'string.empty': 'Поле "password" должно быть заполнено',
        }),
    }),
});
