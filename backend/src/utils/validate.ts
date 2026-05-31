import { celebrate, Joi } from 'celebrate'; // Импортируем celebrate (middleware для валидации в Express) и Joi (библиотека для описания схем валидации)

/**
 * Валидатор для маршрута входа в систему (login).
 * Проверяет, что в теле запроса есть корректные email и пароль.
 */
export const validateLogin = celebrate({
    body: Joi.object({
        // Поле email: обязательная строка, которая должна соответствовать формату email
        email: Joi.string().email().required(),
        // Поле password: обязательная строка (без дополнительных ограничений на длину)
        password: Joi.string().required(),
    }),
});

/**
 * Валидатор для регистрации нового пользователя.
 * Проверяет обязательные поля: email, пароль и имя.
 */
export const validateRegister = celebrate({
    body: Joi.object({
        // Поле email: обязательная строка в формате email
        email: Joi.string().email().required(),
        // Поле password: обязательная строка длиной минимум 6 символов
        password: Joi.string().min(6).required(),
        // Поле name: обязательная строка от 2 до 30 символов
        name: Joi.string().min(2).max(30).required(),
    }),
});

/**
 * Валидатор для обновления данных пользователя.
 * Все поля необязательные — можно передать только то, что нужно изменить.
 */
export const validateUpdateUser = celebrate({
    body: Joi.object({
        // Поле name: строка от 2 до 30 символов (необязательное)
        name: Joi.string().min(2).max(30),
        // Поле email: строка в формате email (необязательное)
        email: Joi.string().email(),
    }),
});

/**
 * Валидатор для обновления товара.
 * Проверяет параметры URL (ID товара) и тело запроса (поля товара).
 */
export const validateUpdateProduct = celebrate({
    params: Joi.object({
        // Параметр productId из URL: обязательная шестнадцатеричная строка длиной 24 символа (формат ObjectId MongoDB)
        productId: Joi.string().hex().length(24).required(),
    }),
    body: Joi.object({
        // Поле title: строка от 2 до 30 символов (необязательное)
        title: Joi.string().min(2).max(30),
        // Поле description: строка длиной до 1000 символов (необязательное)
        description: Joi.string().max(1000),
        // Поле category: простая строка (необязательное)
        category: Joi.string(),
        // Поле price: число не меньше 0; допускается значение null
        price: Joi.number().min(0).allow(null),
        // Поле image: объект с информацией о файле
        image: Joi.object({
            // Поле fileName: строка, содержащая только буквы, цифры и символы _.- (проверяется регулярным выражением)
            fileName: Joi.string().pattern(/^[a-zA-Z0-9._-]+$/),
            // Поле originalName: произвольная строка (необязательное)
            originalName: Joi.string(),
        }),
    })
        // Требует, чтобы в теле запроса было хотя бы одно поле для обновления
        .min(1)
        // Запрещает передавать поля, не описанные в схеме валидации
        .unknown(false),
});
