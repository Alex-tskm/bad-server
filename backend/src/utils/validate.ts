import { celebrate, Joi } from 'celebrate';

/**
 * Валидатор для маршрута авторизации (логин).
 * Проверяет, что в теле запроса присутствуют и корректны:
 * - email: обязательная строка с валидным форматом email
 * - password: обязательная непустая строка
 */
export const validateLogin = celebrate({
    body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required(),
    }),
});

/**
 * Валидатор для маршрута регистрации нового пользователя.
 * Проверяет, что в теле запроса присутствуют и соответствуют правилам:
 * - email: обязательная строка с валидным форматом email
 * - password: обязательная строка, минимальная длина — 6 символов
 * - name: обязательная строка, длина от 2 до 30 символов
 */
export const validateRegister = celebrate({
    body: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        name: Joi.string().min(2).max(30).required(),
    }),
});

/**
 * Валидатор для обновления данных пользователя.
 * В теле запроса могут присутствовать (но не обязательны):
 * - name: строка длиной от 2 до 30 символов
 * - email: строка с валидным форматом email
 */
export const validateUpdateUser = celebrate({
    body: Joi.object({
        name: Joi.string().min(2).max(30),
        email: Joi.string().email(),
    }),
});

/**
 * Валидатор для обновления товара.
 * Проверки:
 * 1. В параметрах запроса обязательно присутствует productId:
 *    строка из 24 шестнадцатеричных символов (формат ObjectId MongoDB)
 * 2. В теле запроса может быть один или более из следующих полей (другие запрещены):
 *    - title: строка от 2 до 30 символов
 *    - description: строка до 1000 символов
 *    - category: произвольная строка
 *    - price: число ≥ 0 или null
 *    - image: объект с двумя полями:
 *      * fileName: строка, содержащая только буквы, цифры и символы . _ -
 *      * originalName: произвольная строка
 *
 * Правила для тела запроса:
 * - .min(1): должно быть передано хотя бы одно поле для обновления
 * - .unknown(false): запрещены любые поля, не описанные в схеме
 */
export const validateUpdateProduct = celebrate({
    params: Joi.object({
        productId: Joi.string().hex().length(24).required(),
    }),

    body: Joi.object({
        title: Joi.string().min(2).max(30),
        description: Joi.string().max(1000),
        category: Joi.string(),
        price: Joi.number().min(0).allow(null),
        image: Joi.object({
            fileName: Joi.string().pattern(/^[a-zA-Z0-9._-]+$/),
            originalName: Joi.string(),
        }),
    })
        .min(1)
        .unknown(false),
});
