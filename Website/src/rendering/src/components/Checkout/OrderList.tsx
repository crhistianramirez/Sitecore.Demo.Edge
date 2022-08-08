import { ChangeEvent } from 'react';
import useOcCurrentOrderState from '../../hooks/useOcCurrentCart';
import {
  retrieveOrders,
  clearCurrentOrder,
  clearAllOrders,
  deleteCurrentOrder,
  retrieveCart,
} from '../../redux/ocCurrentCart';
import { useAppDispatch } from '../../redux/store';
import Skeleton from 'react-loading-skeleton';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faShareAlt, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import useOcAuth from '../../hooks/useOcAuth';

const OrderList = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const { order, orders, initialized } = useOcCurrentOrderState();
  const { isAnonymous } = useOcAuth();

  const handleGetOrders = async () => {
    await dispatch(retrieveOrders());
  };

  const handleClearOrders = async () => {
    await dispatch(clearAllOrders());
  };

  const handleDeleteOrder = async () => {
    await dispatch(deleteCurrentOrder());
  };

  // TODO: add functionality to button
  const btnDefault = !initialized ? (
    <Skeleton width={150} height={44} className="btn-make-default btn-secondary" />
  ) : (
    <button
      className="btn-make-default btn-secondary"
      aria-label="Make Default"
      type="button"
      //onClick={() => handleClearOrders()}
    >
      Make Default
    </button>
  );

  const btnDelete = !initialized ? (
    <Skeleton width={150} height={44} className="btn-delete btn-secondary" />
  ) : (
    <button
      className="btn-delete btn-secondary"
      aria-label="Delete Project"
      type="button"
      onClick={() => handleDeleteOrder()}
    >
      <FontAwesomeIcon icon={faTrashAlt} size="lg" /> Delete Project
    </button>
  );

  // TODO: add functionality to button
  const btnShare = !initialized ? (
    <Skeleton width={150} height={44} className="btn-share btn-secondary" />
  ) : (
    <button
      className="btn-share btn-secondary"
      aria-label="Share"
      type="button"
      //onClick={() => handleGetOrders()}
    >
      <FontAwesomeIcon icon={faShareAlt} size="lg" /> Share
    </button>
  );

  // TODO: add functionality to button
  const btnNew = !initialized ? (
    <Skeleton width={150} height={44} className="btn-new btn-secondary" />
  ) : (
    <button className="btn-new btn-secondary" aria-label="New Project" type="button">
      <FontAwesomeIcon icon={faPlus} size="lg" /> New Project
    </button>
  );

  const handleProjectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    clearCurrentOrder();
    dispatch(retrieveCart(e.target.value));
  };

  const selectProject = !initialized ? (
    <Skeleton width={550} height={44} className="selected-project" />
  ) : (
    <select
      className="selected-project"
      required
      defaultValue={order?.ID}
      onChange={handleProjectChange}
    >
      {orders?.map((order) => (
        // TODO: change value to order?.xp?.Name
        <option key={order.ID} value={order.ID}>
          {order.ID}
        </option>
      ))}
    </select>
  );

  const getContent = () => {
    if (!isAnonymous) {
      return (
        <div className="manage-projects">
          <form className="form">
            {selectProject}
            {btnDefault}
            {btnDelete}
            {btnShare}
            {btnNew}
          </form>
        </div>
      );
    } else {
      return <></>;
    }
  };

  return getContent();
};

export default OrderList;
