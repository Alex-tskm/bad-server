import { Router } from 'express'; 
import csrf from 'csurf';
import {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
} from '../controllers/auth'; // Импортируем обработчики (контроллеры) для аутентификации и управления пользователем
import auth from '../middlewares/auth'; // Импортируем middleware для проверки аутентификации (валидация JWT-токена и т. п.)
import {
    validateLogin,
    validateRegister,
    validateUpdateUser,
} from '../utils/validate'; // Импортируем схемы валидации запросов для маршрутов аутентификации

const authRouter = Router(); // Создаём экземпляр маршрутизатора для группировки маршрутов, связанных с аутентификацией

// Инициализируем middleware CSRF-защиты с настройкой работы через cookies
// CSRF (Cross-Site Request Forgery) — защита от подделки межсайтовых запросов
const csrfProtection = csrf({ cookie: true });

// Маршрут для получения CSRF-токена: клиент запрашивает токен, сервер возвращает его в JSON
// Используется для защиты клиент-серверного взаимодействия от CSRF
authRouter.get('/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// Маршрут получения данных текущего пользователя: требует аутентификации (middleware auth)
authRouter.get('/user', auth, getCurrentUser);

// Маршрут обновления данных текущего пользователя: сначала валидирует входные данные, затем проверяет аутентификацию и передаёт управление контроллеру
authRouter.patch('/me', validateUpdateUser, auth, updateCurrentUser);

// Маршрут получения ролей текущего пользователя: требует аутентификации
authRouter.get('/user/roles', auth, getCurrentUserRoles);

// Маршрут входа пользователя в систему: применяет CSRF-защиту, валидирует данные входа, затем передаёт управление контроллеру login
authRouter.post('/login', csrfProtection, validateLogin, login);

// Маршрут обновления access-токена (например, при истечении срока действия): не требует CSRF, так как обычно работает на уровне API и токенов
authRouter.get('/token', refreshAccessToken);

// Маршрут выхода пользователя из системы: не требует дополнительной валидации, выполняет логику logout
authRouter.get('/logout', logout);

// Маршрут регистрации нового пользователя: применяет CSRF-защиту, валидирует входные данные и передаёт управление контроллеру register
authRouter.post('/register', csrfProtection, validateRegister, register);

export default authRouter; // Экспортируем маршрутизатор для подключения в основном приложении 
