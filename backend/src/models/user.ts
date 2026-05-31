import crypto from 'crypto' // Для криптографических операций (например, хеширования refresh-токенов)
import jwt from 'jsonwebtoken' // Для создания и верификации JWT-токенов (access и refresh)
import mongoose, { Document, HydratedDocument, Model, Types } from 'mongoose' // ODM для MongoDB: работа с моделями и схемами
import validator from 'validator' // Для валидации данных, например, email-адресов
import md5 from 'md5' // Библиотека для хеширования паролей (хотя MD5 считается небезопасным)

import { ACCESS_TOKEN, REFRESH_TOKEN } from '../config' // Конфигурационные данные для JWT (секреты и время жизни токенов)
import UnauthorizedError from '../errors/unauthorized-error' // Кастомная ошибка для случаев неудачной аутентификации

// Перечисление ролей пользователей в системе
export enum Role {
    Customer = 'customer', // Обычная роль для покупателей
    Admin = 'admin', // Роль администратора с расширенными правами
}

// Интерфейс документа пользователя в MongoDB — описывает структуру данных
export interface IUser extends Document {
    name: string // Имя пользователя (по умолчанию «Евлампий»)
    email: string // Email пользователя (обязательное, уникальное поле)
    password: string // Пароль в виде хеша (поле скрыто при выводе: select: false)
    tokens: { token: string }[] // Массив сохранённых refresh-токенов (для управления сессиями)
    roles: Role[] // Массив ролей пользователя (по умолчанию — [Role.Customer])
    phone: string // Номер телефона (опциональное поле)
    totalAmount: number // Общая сумма всех заказов пользователя
    orderCount: number // Количество заказов пользователя
    orders: Types.ObjectId[] // Ссылки на документы заказов в коллекции orders
    lastOrderDate: Date | null // Дата последнего заказа
    lastOrder: Types.ObjectId | null // Ссылка на последний заказ пользователя
}

// Методы, доступные для экземпляров модели User
interface IUserMethods {
    generateAccessToken(): string // Генерирует access-токен для авторизации запросов
    generateRefreshToken(): Promise<string> // Генерирует и сохраняет refresh-токен, возвращает его клиенту
    toJSON(): string // Переопределяет стандартное преобразование документа в JSON
    calculateOrderStats(): Promise<void> // Обновляет статистику заказов пользователя на основе данных из БД
}

// Статические методы модели User (вызываются на самой модели, а не на экземпляре)
interface IUserModel extends Model<IUser, {}, IUserMethods> {
    findUserByCredentials: (
        email: string,
        password: string
    ) => Promise<HydratedDocument<IUser, IUserMethods>> // Находит пользователя по email и паролю, проверяет учётные данные
}

// Схема пользователя для Mongoose — описывает структуру документа и его поведение
const userSchema = new mongoose.Schema<IUser, IUserModel, IUserMethods>(
    {
        name: {
            type: String,
            default: 'Иван', // Значение по умолчанию
            minlength: [2, 'Минимальная длина поля "name" - 2'], // Валидация длины имени
            maxlength: [30, 'Максимальная длина поля "name" - 30'],
        },
        email: {
            type: String,
            required: [true, 'Поле "email" должно быть заполнено'], // Обязательное поле
            unique: true, // Гарантирует уникальность email в коллекции
            validate: {
                validator: (v: string) => validator.isEmail(v), // Валидация формата email
                message: 'Поле "email" должно быть валидным email-адресом',
            },
        },
        password: {
            type: String,
            required: [true, 'Поле "password" должно быть заполнено'], // Обязательное поле
            minlength: [6, 'Минимальная длина поля "password" - 6'], // Минимальная длина пароля
            select: false, // Поле не возвращается при обычных запросах к БД (безопасность)
        },
        tokens: [
            {
                token: { required: true, type: String }, // Массив токенов для управления активными сессиями
            },
        ],
        roles: {
            type: [String],
            enum: Object.values(Role), // Разрешённые значения: 'customer' или 'admin'
            default: [Role.Customer], // Роль по умолчанию
        },
        phone: {
            type: String, // Необязательное поле для номера телефона
        },
        lastOrderDate: {
            type: Date,
            default: null, // Дата последнего заказа (может быть null)
        },
        lastOrder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'order', // Ссылка на документ заказа в коллекции orders
            default: null,
        },
        totalAmount: { type: Number, default: 0 }, // Общая сумма заказов пользователя
        orderCount: { type: Number, default: 0 }, // Количество заказов
        orders: [
            {
                type: Types.ObjectId,
                ref: 'order', // Массив ссылок на заказы пользователя
            },
        ],
    },
    {
        versionKey: false, // Отключает поле __v (версия документа в MongoDB)
        timestamps: true, // Автоматически добавляет поля createdAt и updatedAt
        toJSON: {
            virtuals: true,
            transform: (_doc, ret) => {
                // При преобразовании документа в JSON исключаем чувствительные поля
                const {
                    tokens: _tokens, // Исключаем массив токенов
                    password: _password, // Исключаем пароль
                    _id,
                    roles: _roles,
                    ...rest
                } = ret
                return rest
            },
        },
    }
)

// Хук перед сохранением документа: хеширует пароль, если он был изменён
userSchema.pre('save', async function hashingPassword(next) {
    try {
        if (this.isModified('password')) { // Проверяем, был ли изменён пароль
            this.password = md5(this.password) // Хешируем пароль с помощью MD5 
        }
        next()
    } catch (error) {
        next(error as Error)
    }
})

// Метод экземпляра: генерирует access-токен для авторизации запросов
userSchema.methods.generateAccessToken = function generateAccessToken() {
    const user = this
    return jwt.sign(
        {
            _id: user._id.toString(),
            email: user.email,
        },
        ACCESS_TOKEN.secret, // Секретный ключ для подписи токена
        {
            expiresIn: ACCESS_TOKEN.expiry, // Время жизни токена
            subject: user.id.toString(), // Субъект токена (ID пользователя)
        }
    )
}

// Метод экземпляра: генерирует refresh-токен и сохраняет его хеш в БД
userSchema.methods.generateRefreshToken =
    async function generateRefreshToken() {
        const user = this
        // Создаём JWT refresh-токен
        const refreshToken = jwt.sign(
            {
                _id: user._id.toString(),
            },
            REFRESH_TOKEN.secret,
            {
                expiresIn: REFRESH_TOKEN.expiry,
                subject: user.id.toString(),
            }
        )

        // Хешируем refresh-токен перед сохранением в БД (для безопасности)
        const rTknHash = crypto
            .createHmac('sha256', REFRESH_TOKEN.secret)
            .update(refreshToken)
            .digest('hex')

        // Сохраняем хеш токена в массив tokens документа пользователя
        user.tokens.push({ token: rTknHash })
        await user.save()

        return refreshToken // Возвращаем оригинальный (нехешированный) токен клиенту
    }

// Статический метод: находит пользователя по email и проверяет пароль
userSchema.statics.findUserByCredentials = async function findByCredentials(
    email: string,
    password: string
) {
    // Ищем пользователя по email, принудительно включаем поле password для проверки
    const user = await this.findOne({ email: String(email) })
        .select('+password')
        .orFail(() => new UnauthorizedError('Неправильные почта или пароль'))

    // Сравниваем хеши паролей: введённый пароль хешируем и сравниваем с сохранённым
    const passwdMatch = md5(password) === user.password
    if (!passwdMatch) {
        return Promise.reject(
            new UnauthorizedError('Неправильные почта или пароль')
        )
    }
    return user
}

// Метод экземпляра: пересчитывает статистику заказов пользователя с помощью агрегации MongoDB
userSchema.methods.calculateOrderStats = async function calculateOrderStats() {
    const user = this;
    // Агрегационный запрос для подсчёта статистики по заказам пользователя:
    // - фильтруем заказы по ID клиента (user._id)
    // - группируем результаты, чтобы посчитать общую сумму, количество заказов,
    //   дату последнего заказа и ID последнего заказа
    const orderStats = await mongoose.model('order').aggregate([
        { $match: { customer: user._id } },
        {
            $group: {
                _id: null, // группируем все подходящие документы в один результат
                totalAmount: { $sum: '$totalAmount' }, // суммируем поле totalAmount всех заказов
                lastOrderDate: { $max: '$createdAt' }, // находим максимальную дату создания заказа (последний заказ)
                orderCount: { $sum: 1 }, // считаем количество заказов (суммируем 1 для каждого документа)
                lastOrder: { $last: '$_id' }, // берём ID последнего документа в группе (требует предварительной сортировки для точности)
            },
        },
    ]);

    // Если найдены заказы пользователя (массив orderStats не пустой)
    if (orderStats.length > 0) {
        const stats = orderStats[0]; // извлекаем объект с результатами агрегации
        // Обновляем поля документа пользователя на основе результатов агрегации
        user.totalAmount = stats.totalAmount; // общая сумма всех заказов
        user.orderCount = stats.orderCount; // количество заказов
        user.lastOrderDate = stats.lastOrderDate; // дата последнего заказа
        user.lastOrder = stats.lastOrder; // ID последнего заказа
    } else {
        // Если заказов нет, сбрасываем статистику до начальных значений
        user.totalAmount = 0;
        user.orderCount = 0;
        user.lastOrderDate = null;
        user.lastOrder = null;
    }

    // Сохраняем обновлённый документ пользователя в БД
    await user.save();
};

// Создаём модель User на основе схемы userSchema
const UserModel = mongoose.model<IUser, IUserModel>('user', userSchema);

// Экспортируем модель для использования в других модулях приложения
export default UserModel;
