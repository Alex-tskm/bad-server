import { Router } from 'express'; 
import {
    createOrder,
    deleteOrder,
    getOrderByNumber,
    getOrderCurrentUserByNumber,
    getOrders,
    getOrdersCurrentUser,
    updateOrder,
} from '../controllers/order'; // Импортируем контроллеры для работы с заказами (CRUD-операции и специализированные методы)
import auth, { roleGuardMiddleware } from '../middlewares/auth'; // Импортируем middleware аутентификации и middleware для проверки роли пользователя
import { validateOrderBody } from '../middlewares/validations'; // Импортируем middleware с валидацией тела запроса для создания/обновления заказа
import { Role } from '../models/user'; // Импортируем enum/тип ролей пользователей для использования в guard-middleware

const orderRouter = Router(); // Создаём экземпляр маршрутизатора для группировки маршрутов, связанных с управлением заказами

// Маршрут создания заказа: требует аутентификации, валидирует тело запроса и передаёт управление контроллеру createOrder
orderRouter.post('/', auth, validateOrderBody, createOrder);

// Маршрут получения всех заказов: требует аутентификации и наличия роли Admin (проверяется через roleGuardMiddleware)
orderRouter.get('/all', auth, roleGuardMiddleware(Role.Admin), getOrders);

// Маршрут получения заказов текущего пользователя: требует аутентификации, возвращает только заказы авторизованного пользователя
orderRouter.get('/all/me', auth, getOrdersCurrentUser);

// Маршрут получения заказа по номеру: требует аутентификации и роли Admin, передаёт управление контроллеру getOrderByNumber
orderRouter.get(
    '/:orderNumber',
    auth,
    roleGuardMiddleware(Role.Admin),
    getOrderByNumber
);

// Маршрут получения заказа текущего пользователя по номеру: требует аутентификации, позволяет пользователю видеть только свои заказы
orderRouter.get('/me/:orderNumber', auth, getOrderCurrentUserByNumber);

// Маршрут обновления заказа: требует аутентификации и роли Admin, затем передаёт управление контроллеру updateOrder
orderRouter.patch(
    '/:orderNumber',
    auth,
    roleGuardMiddleware(Role.Admin),
    updateOrder
);

// Маршрут удаления заказа: требует аутентификации и роли Admin, передаёт управление контроллеру deleteOrder
orderRouter.delete('/:id', auth, roleGuardMiddleware(Role.Admin), deleteOrder);

export default orderRouter; // Экспортируем маршрутизатор для подключения в основном приложении 
