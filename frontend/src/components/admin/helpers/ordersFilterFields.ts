import { FILTER_ORDER_TYPES, FilterType } from '../../../utils/constants'
import { StatusType } from '@types'

export interface OrdersFilterValues {
    orderDateFrom?: string;
    orderDateTo?: string;
    status?: { value: StatusType }; 
    totalAmountFrom?: number;
    totalAmountTo?: number;
}

export const ordersFilterFields = [
    { label: 'Дата заказа' },
    { name: 'orderDateFrom', label: 'с', type: FilterType.date },
    { name: 'orderDateTo', label: 'по', type: FilterType.date },
    {
        name: 'status',
        label: 'Статус заказа',
        type: FilterType.select,
        options: FILTER_ORDER_TYPES,
    },
    { label: 'Стоимость заказа' },
    { name: 'totalAmountFrom', label: 'от', type: FilterType.number },
    { name: 'totalAmountTo', label: 'до', type: FilterType.number },
]
