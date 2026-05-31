import crypto from 'crypto'; 
import { NextFunction, Request, Response } from 'express'; 
import { constants } from 'http2'; 
import jwt, { JwtPayload } from 'jsonwebtoken'; 
import { Error as MongooseError } from 'mongoose'; 
import { REFRESH_TOKEN } from '../config'; 
import BadRequestError from '../errors/bad-request-error'; 
import ConflictError from '../errors/conflict-error'; 
import NotFoundError from '../errors/not-found-error'; 
import UnauthorizedError from '../errors/unauthorized-error'; 
import User from '../models/user'; 

// POST /auth/login
// Обработчик входа пользователя в систему
const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body; // Извлекаем email и пароль из тела запроса
        // Находим пользователя по учётным данным (проверка пароля происходит внутри метода)
        const user = await User.findUserByCredentials(email, password);
        // Генерируем access-токен для авторизации запросов
        const accessToken = user.generateAccessToken();
        // Генерируем и сохраняем refresh-токен, возвращаем его клиенту
        const refreshToken = await user.generateRefreshToken();
        // Устанавливаем refresh-токен в куки с настройками из конфигурации
        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        );
        // Возвращаем успех, данные пользователя и access-токен
        return res.json({
            success: true,
            user,
            accessToken,
        });
    } catch (err) {
        // Передаём ошибку в middleware обработки ошибок
        return next(err);
    }
};

// POST /auth/register
// Обработчик регистрации нового пользователя
const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password, name } = req.body; // Извлекаем данные из тела запроса
        const newUser = new User({ email, password, name }); // Создаём экземпляр модели User
        await newUser.save(); // Сохраняем пользователя в БД (пароль хешируется в хуке pre('save'))
        // Генерируем access и refresh токены для нового пользователя
        const accessToken = newUser.generateAccessToken();
        const refreshToken = await newUser.generateRefreshToken();

        // Устанавливаем refresh-токен в куки
        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        );
        // Возвращаем статус 201 (создано) и данные пользователя
        return res.status(constants.HTTP_STATUS_CREATED).json({
            success: true,
            user: newUser,
            accessToken,
        });
    } catch (error) {
        // Обрабатываем ошибки валидации Mongoose
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message));
        }
        // Обрабатываем ошибку дублирования (например, уникальный email уже существует)
        if (error instanceof Error && error.message.includes('E11000')) {
            return next(
                new ConflictError('Пользователь с таким email уже существует')
            );
        }
        // Все остальные ошибки передаём дальше
        return next(error);
    }
};

// GET /auth/user
// Обработчик получения данных текущего авторизованного пользователя
const getCurrentUser = async (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id; // ID пользователя, установленный в middleware аутентификации
        // Ищем пользователя по ID, если не найден — выбрасываем ошибку 404
        const user = await User.findById(userId).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        );
        // Возвращаем данные пользователя и флаг успеха
        res.json({ user, success: true });
    } catch (error) {
        next(error); // Передаём ошибку в обработчик ошибок
    }
};

// Вспомогательная функция для удаления refresh-токена из документа пользователя
const deleteRefreshTokenInUser = async (
    req: Request,
    _res: Response,
    _next: NextFunction
) => {
    const { cookies } = req; // Извлекаем куки из запроса
    const rfTkn = cookies[REFRESH_TOKEN.cookie.name]; // Получаем refresh-токен из куки

    // Если токена нет — выбрасываем ошибку неавторизованного доступа
    if (!rfTkn) {
        throw new UnauthorizedError('Не валидный токен');
    }

    // Верифицируем refresh-токен и извлекаем полезную нагрузку (JwtPayload)
    const decodedRefreshTkn = jwt.verify(
        rfTkn,
        REFRESH_TOKEN.secret
    ) as JwtPayload;
    // Ищем пользователя по ID из токена, если не найден — ошибка 401
    const user = await User.findOne({
        _id: decodedRefreshTkn._id,
    }).orFail(() => new UnauthorizedError('Пользователь не найден в базе'));

    // Хешируем refresh-токен (так он хранится в БД)
    const rTknHash = crypto
        .createHmac('sha256', REFRESH_TOKEN.secret)
        .update(rfTkn)
        .digest('hex');

    // Удаляем токен из массива tokens пользователя
    user.tokens = user.tokens.filter((tokenObj) => tokenObj.token !== rTknHash);

    await user.save(); // Сохраняем изменения в БД

    return user; // Возвращаем обновлённый документ пользователя
};

// GET /auth/logout
// Обработчик выхода пользователя из системы
const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Удаляем refresh-токен из документа пользователя в БД
        await deleteRefreshTokenInUser(req, res, next);
        // Устанавливаем куки с отрицательным maxAge, чтобы удалить её на стороне клиента
        const expireCookieOptions = {
            ...REFRESH_TOKEN.cookie.options,
            maxAge: -1,
        };
        res.cookie(REFRESH_TOKEN.cookie.name, '', expireCookieOptions);
        // Возвращаем успешный ответ
        res.status(200).json({
            success: true,
        });
    } catch (error) {
        next(error); // Передаём ошибку в обработчик
    }
};

// GET /auth/token
// Обработчик обновления access-токена с использованием refresh-токена
const refreshAccessToken = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Удаляем старый refresh-токен из БД и получаем документ пользователя
        const userWithRefreshTkn = await deleteRefreshTokenInUser(
            req,
            res,
            next
        );
        // Генерируем новый access-токен
        const accessToken = await userWithRefreshTkn.generateAccessToken();
        // Генерируем и сохраняем новый refresh-токен
        const refreshToken = await userWithRefreshTkn.generateRefreshToken();
        // Устанавливаем новый refresh-токен в куки
        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        );
        // Возвращаем новый access-токен и данные пользователя
        return res.json({
            success: true,
            user: userWithRefreshTkn,
            accessToken,
        });
    } catch (error) {
        return next(error); // Передаём ошибку дальше
    }
};

// GET /auth/roles
// Обработчик получения ролей текущего пользователя
const getCurrentUserRoles = async (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id; // Получаем ID пользователя из локальных переменных ответа (установлен в middleware аутентификации)
    try {
        // Ищем пользователя по ID, запрашиваем только поле roles
        // Обратите внимание: в оригинальном коде была ошибка — req.body передавался как параметры проекции, что некорректно
        const user = await User.findById(userId, { roles: 1 })
            .orFail(
                () => new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
            );
        // Возвращаем массив ролей пользователя и флаг успеха
        res.status(200).json({
            success: true,
            roles: user.roles
        });
    } catch (error) {
        next(error); // Передаём ошибку в обработчик ошибок
    }
};

// PUT /auth/user
// Обработчик обновления данных текущего пользователя (имя и email)
const updateCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id; // ID пользователя из middleware аутентификации
    const { name, email } = req.body; // Извлекаем новые значения имени и email из тела запроса
    try {
        // Обновляем пользователя по ID: устанавливаем новые name и email
        // { new: true } — возвращаем обновлённый документ
        // { runValidators: true } — запускаем валидаторы схемы (например, проверку email)
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { name, email },
            {
                new: true,
                runValidators: true,
            }
        ).orFail(
            () => new NotFoundError(
                'Пользователь по заданному id отсутствует в базе'
            )
        );
        // Возвращаем обновлённого пользователя с статусом 200
        res.status(200).json(updatedUser);
    } catch (error) {
        next(error); // Передаём ошибку дальше
    }
};

// Экспортируем все обработчики для подключения в маршрутах
export {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
};
