import { NextFunction, Request, Response } from 'express'; 
import { FilterQuery, Error as MongooseError, Types } from 'mongoose'; 
import sanitizeHtml from 'sanitize-html'; 
import BadRequestError from '../errors/bad-request-error'; 
import NotFoundError from '../errors/not-found-error'; 
import Order, { IOrder } from '../models/order'; 
import Product, { IProduct } from '../models/product'; 
import User from '../models/user'; 
import { escapeRegex } from '../utils/escapeRegex'; 

// eslint-disable-next-line max-len
// GET /orders?page=2&limit=5&sort=totalAmount&order=desc&orderDateFrom=2024-07-01&orderDateTo=2024-08-01&status=delivering&totalAmountFrom=100&totalAmountTo=1000&search=%2B1
// Маршрут для получения списка заказов с фильтрацией, сортировкой и пагинацией

// Обработчик получения списка заказов с расширенной фильтрацией
export const getOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Извлекаем параметры запроса: пагинация, сортировка, фильтры
        const {
            page = 1,
            limit = 10,
            sortField = 'createdAt',
            sortOrder = 'desc',
            status,
            totalAmountFrom,
            totalAmountTo,
            orderDateFrom,
            orderDateTo,
            search,
        } = req.query;

        // Объект фильтров для MongoDB-запроса
        const filters: FilterQuery<Partial<IOrder>> = {};

        // Фильтрация по статусу заказа
        if (status) {
            if (typeof status !== 'string') {
                throw new BadRequestError('Некорректный status');
            }
            filters.status = status;
        }

        // Фильтрация по минимальной сумме заказа
        if (totalAmountFrom) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $gte: Number(totalAmountFrom), // $gte — greater than or equal (больше или равно)
            };
        }

        // Фильтрация по максимальной сумме заказа
        if (totalAmountTo) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $lte: Number(totalAmountTo), // $lte — less than or equal (меньше или равно)
            };
        }

        // Фильтрация по дате создания заказа (от)
        if (orderDateFrom) {
            filters.createdAt = {
                ...filters.createdAt,
                $gte: new Date(orderDateFrom as string),
            };
        }

        // Фильтрация по дате создания заказа (до)
        if (orderDateTo) {
            filters.createdAt = {
                ...filters.createdAt,
                $lte: new Date(orderDateTo as string),
            };
        }

        // Агрегационный пайплайн для сложного запроса с JOIN-операциями
        const aggregatePipeline: any[] = [
            { $match: filters }, // Применяем фильтры к заказам
            // JOIN с коллекцией товаров: связываем заказы с товарами по полю products
            {
                $lookup: {
                    from: 'products',
                    localField: 'products',
                    foreignField: '_id',
                    as: 'products',
                },
            },
            // JOIN с коллекцией пользователей: связываем заказы с клиентами
            {
                $lookup: {
                    from: 'users',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customer',
                },
            },
            { $unwind: '$customer' }, // Разворачиваем массив customer в объект
            { $unwind: '$products' },  // Разворачиваем массив товаров в отдельные документы
        ];

        // Поиск по названию товара или номеру заказа
        if (search) {
            const searchRegex = new RegExp(escapeRegex(search as string), 'i'); // Экранируем спецсимволы для безопасного поиска
            const searchNumber = Number(search);

            // Условия поиска: по названию товара ИЛИ по номеру заказа (если search — число)
            const searchConditions: any[] = [{ 'products.title': searchRegex }];

            if (!Number.isNaN(searchNumber)) {
                searchConditions.push({ orderNumber: searchNumber });
            }

            // Добавляем условие поиска в пайплайн
            aggregatePipeline.push({
                $match: {
                    $or: searchConditions,
                },
            });

            filters.$or = searchConditions; // Добавляем в общий объект фильтров
        }

        // Валидация параметров сортировки
        if (typeof sortField !== 'string' || typeof sortOrder !== 'string') {
            return next(new BadRequestError('Некорректные параметры'));
        }

        // Формируем объект сортировки: -1 для desc, 1 для asc
        const sort: { [key: string]: any } = {};
        if (sortField && sortOrder) {
            sort[sortField as string] = sortOrder === 'desc' ? -1 : 1;
        }

        // Ограничение максимального размера страницы (не более 10 записей)
        const normalLimit = Math.min(Number(limit) || 10, 10);

        // Добавляем этапы сортировки, пагинации и группировки в пайплайн
        aggregatePipeline.push(
            { $sort: sort }, // Сортировка результатов
            { $skip: (Number(page) - 1) * Number(normalLimit) }, // Пропуск записей для пагинации
            { $limit: Number(normalLimit) }, // Ограничение количества возвращаемых записей
            // Группировка для восстановления структуры документа заказа
            {
                $group: {
                    _id: '$_id',
                    orderNumber: { $first: '$orderNumber' },
                    status: { $first: '$status' },
                    totalAmount: { $first: '$totalAmount' },
                    products: { $push: '$products' }, // Собираем товары обратно в массив
                    customer: { $first: '$customer' },
                    createdAt: { $first: '$createdAt' },
                },
            }
        );

        // Выполняем агрегацию и подсчёт общего количества заказов
        const orders = await Order.aggregate(aggregatePipeline);
        const totalOrders = await Order.countDocuments(filters);
        const totalPages = Math.ceil(totalOrders / Number(normalLimit)); // Расчёт общего числа страниц

        // Возвращаем ответ с заказами и метаданными пагинации
        res.status(200).json({
            orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: Number(page),
                pageSize: Number(normalLimit),
            },
        });
    } catch (error) {
        next(error); // Передаём ошибку в middleware обработки ошибок
    }
};

// Обработчик получения заказов текущего пользователя
export const getOrdersCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id; // ID авторизованного пользователя из middleware
        const { search, page = 1, limit = 5 } = req.query; // Параметры поиска и пагинации
        const options = {
            skip: (Number(page) - 1) * Number(limit), // Расчёт смещения для пагинации
            limit: Number(limit),
        };

        // Получаем пользователя с заполненными заказами (включая товары и клиента)
        const user = await User.findById(userId)
            .populate({
                path: 'orders',
                populate: [
                    {
                        path: 'products', // Заполняем информацию о товарах в заказах
                    },
                    {
                        path: 'customer', // Заполняем информацию о клиенте
                    },
                ],
            })
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            );

        let orders = user.orders as unknown as IOrder[]; // Приводим тип для дальнейшей работы

        // Фильтрация заказов по поисковому запросу
        if (search) {
            // Экранируем специальные символы в строке поиска для безопасного использования в регулярном выражении
            const searchRegex = new RegExp(search as string, 'i');
            // Преобразуем поисковую строку в число (если это возможно)
            const searchNumber = Number(search);
            // Ищем товары, название которых соответствует поисковому запросу
            const products = await Product.find({ title: searchRegex });
            // Извлекаем ID найденных товаров
            const productIds = products.map((product) => product._id);

            // Фильтруем заказы: оставляем только те, которые содержат искомые товары
            // или имеют номер, совпадающий с числовым значением search
            orders = orders.filter((order) => {
                // Проверяем, есть ли в заказе товары, которые соответствуют поисковому запросу
                const matchesProductTitle = order.products.some((product) =>
                    productIds.some((id) => id.equals(product._id))
                );
                // Проверяем, совпадает ли номер заказа с числовым значением search (если оно корректно)
                const matchesOrderNumber =
                    !Number.isNaN(searchNumber) &&
                    order.orderNumber === searchNumber;

                // Заказ подходит, если выполняется хотя бы одно из условий
                return matchesOrderNumber || matchesProductTitle;
            });
        }

        // Подсчитываем общее количество заказов после фильтрации
        const totalOrders = orders.length;
        // Рассчитываем общее количество страниц для пагинации
        const totalPages = Math.ceil(totalOrders / Number(limit));

        // Применяем пагинацию: выбираем только те заказы, которые должны быть показаны на текущей странице
        orders = orders.slice(options.skip, options.skip + options.limit);

        // Отправляем ответ клиенту: список заказов и метаданные пагинации
        return res.send({
            orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: Number(page),
                pageSize: Number(limit),
            },
        });
    } catch (error) {
        next(error); // Передаём ошибку в middleware обработки ошибок
    }
};

// Обработчик получения заказа по номеру
// GET /order/:orderNumber
export const getOrderByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Ищем заказ по номеру, заполняем связанные документы (клиент, товары)
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            );
        // Возвращаем найденный заказ с статусом 200
        return res.status(200).json(order);
    } catch (error) {
        // Если ошибка связана с некорректным форматом ID — возвращаем ошибку 400
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'));
        }
        // Все остальные ошибки передаём дальше
        return next(error);
    }
};

// Обработчик получения заказа текущего пользователя по номеру
// GET /user/order/:orderNumber
export const getOrderCurrentUserByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id; // ID авторизованного пользователя из middleware
    try {
        // Ищем заказ по номеру, заполняем связанные документы
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            );
        // Проверяем, принадлежит ли заказ текущему пользователю
        if (!order.customer._id.equals(userId)) {
            // Для безопасности не сообщаем, что заказ существует, но принадлежит другому пользователю
            // Вместо 403 возвращаем 404
            return next(
                new NotFoundError('Заказ по заданному id отсутствует в базе')
            );
        }
        // Возвращаем заказ с статусом 200
        return res.status(200).json(order);
    } catch (error) {
        // Обрабатываем ошибку некорректного формата ID
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'));
        }
        // Все остальные ошибки передаём дальше
        return next(error);
    }
};

// Обработчик создания нового заказа
// POST /product
export const createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const basket: IProduct[] = []; // Корзина: массив товаров, включённых в заказ
        // Получаем все товары из базы данных
        const products = await Product.find<IProduct>({});
        const userId = res.locals.user._id; // ID авторизованного пользователя
        // Извлекаем данные заказа из тела запроса
        const { address, payment, phone, total, email, items, comment } =
            req.body;

        // Для каждого ID товара из заказа:
        items.forEach((id: Types.ObjectId) => {
            // Находим товар в базе данных по ID
            const product = products.find((p) => p._id.equals(id));
            // Если товар не найден — выбрасываем ошибку
            if (!product) {
                throw new BadRequestError(`Товар с id ${id} не найден`);
            }
            // Если у товара нет цены (например, снят с продажи) — выбрасываем ошибку
            if (product.price === null) {
                throw new BadRequestError(`Товар с id ${id} не продаётся`);
            }
            // Добавляем товар в корзину
            return basket.push(product);
        });
        // Считаем общую стоимость товаров в корзине
        const totalBasket = basket.reduce((a, c) => a + c.price, 0);
        // Сравниваем рассчитанную сумму с переданной в запросе
        if (totalBasket !== total) {
            return next(new BadRequestError('Неверная сумма заказа'));
        }

        // Очищаем комментарий от HTML-тегов для защиты от XSS-атак
        const sanitizedComment = sanitizeHtml(comment || '', {
            allowedTags: [], // Запрещаем все HTML-теги
            allowedAttributes: {}, // Запрещаем все атрибуты
        });

        // Создаём новый документ заказа
        const newOrder = new Order({
            totalAmount: total, // Общая сумма заказа
            products: items, // Массив ID товаров
            payment, // Способ оплаты
            phone, // Номер телефона клиента
            email, // Email клиента
            comment: sanitizedComment, // Очищенный комментарий
            customer: userId, // ID пользователя, сделавшего заказ
            deliveryAddress: address, // Адрес доставки
        });
        // Заполняем связанные документы (клиент, товары) в новом заказе
        const populateOrder = await newOrder.populate(['customer', 'products']);
        // Сохраняем заказ в базе данных
        await populateOrder.save();

        // Возвращаем созданный заказ с статусом 200
        return res.status(200).json(populateOrder);
    } catch (error) {
        // Обрабатываем ошибки валидации схемы Mongoose
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message));
        }
        // Все остальные ошибки передаём дальше
        return next(error);
    }
};

// Обработчик обновления заказа
// PUT /order/:orderNumber
export const updateOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { status } = req.body; // Извлекаем новое значение статуса из тела запроса
        // Обновляем заказ по номеру: устанавливаем новый статус, возвращаем обновлённый документ
        const updatedOrder = await Order.findOneAndUpdate(
            { orderNumber: req.params.orderNumber },
            { status },
            { new: true, runValidators: true } // new: true — возвращаем обновлённый документ; runValidators — запускаем валидаторы схемы
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products']); // Заполняем связанные документы

        // Возвращаем обновлённый заказ с статусом 200
        return res.status(200).json(updatedOrder);
    } catch (error) {
        // Обрабатываем ошибки валидации схемы Mongoose
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message));
        }
        // Обрабатываем ошибку некорректного формата ID
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'));
        }
        // Все остальные ошибки передаём дальше в middleware
        return next(error);
    }
};

// Обработчик удаления заказа
// DELETE /order/:id
export const deleteOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Удаляем заказ по ID и сразу заполняем связанные документы (клиент, товары)
        const deletedOrder = await Order.findByIdAndDelete(req.params.id)
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products']);

        // Возвращаем удалённый заказ с статусом 200 (можно было бы использовать 204, но здесь отдаём данные для наглядности)
        return res.status(200).json(deletedOrder);
    } catch (error) {
        // Обрабатываем ошибку некорректного формата ID
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'));
        }
        // Все остальные ошибки передаём дальше
        return next(error);
    }
};
