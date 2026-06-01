import { Router } from 'express';
import { celebrate, Joi } from 'celebrate'; // Переместили выше
import {
    deleteCustomer,
    getCustomerById,
    getCustomers,
    updateCustomer,
} from '../controllers/customers'; // Теперь после внешних пакетов
import auth, { roleGuardMiddleware } from '../middlewares/auth';
import { Role } from '../models/user';

const customerRouter = Router();

// Маршрут получения списка всех клиентов: требует аутентификации и наличия роли Admin (проверяется через roleGuardMiddleware)
customerRouter.get('/', auth, roleGuardMiddleware(Role.Admin), getCustomers);

// Маршрут получения клиента по ID:
// 1. Валидирует параметр id в URL (должен быть шестнадцатеричной строкой длиной 24 символа — формат ObjectId MongoDB)
// 2. Проверяет аутентификацию пользователя
// 3. Передаёт управление контроллеру getCustomerById
customerRouter.get(
    '/:id',
    celebrate({
        params: Joi.object({
            // Валидация параметра id из URL: обязательная шестнадцатеричная строка длиной 24 символа
            id: Joi.string().hex().length(24).required(),
        }),
    }),
    auth,
    getCustomerById
);

// Маршрут обновления клиента по ID: требует аутентификации, затем передаёт управление контроллеру updateCustomer
customerRouter.patch('/:id', auth, updateCustomer);

// Маршрут удаления клиента по ID: требует аутентификации, затем передаёт управление контроллеру deleteCustomer
customerRouter.delete('/:id', auth, deleteCustomer);

export default customerRouter; // Экспортируем маршрутизатор для подключения в основном приложении
