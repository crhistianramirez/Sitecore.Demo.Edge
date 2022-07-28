import { OcUnsubmittedOrdersState } from '../redux/ocUnsubmittedOrders';
import { useAppSelector } from '../redux/store';

const useOcUnsubmittedOrders = (): OcUnsubmittedOrdersState =>
  useAppSelector((s) => s.ocUnsubmittedOrders);

export default useOcUnsubmittedOrders;
