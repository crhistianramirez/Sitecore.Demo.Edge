import { ChangeEvent, useState } from 'react';
import { Order } from 'ordercloud-javascript-sdk';
import useOcCurrentOrderState from '../../hooks/useOcCurrentCart';
import {
  clearCurrentOrder,
  createNewOrder,
  deleteCurrentOrder,
  retrieveCart,
} from '../../redux/ocCurrentCart';
import { useAppDispatch } from '../../redux/store';
import Skeleton from 'react-loading-skeleton';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faShareAlt, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import useOcAuth from '../../hooks/useOcAuth';
import Spinner from '../../components/ShopCommon/Spinner';
import toast from 'react-hot-toast';

const OrderList = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const { order, orders, initialized } = useOcCurrentOrderState();
  const { isAnonymous } = useOcAuth();
  const [selectedOrder, setSelectedOrder] = useState(order?.ID);
  const [orderName, setOrderName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDeleteOrder = async () => {
    setIsLoading(true);
    await dispatch(deleteCurrentOrder());
    setIsLoading(false);
  };

  const btnDelete = !initialized ? (
    <Skeleton width={150} height={44} className="btn-delete btn-secondary" />
  ) : (
    <button
      className="btn-delete btn-secondary"
      aria-label="Delete Project"
      type="button"
      onClick={() => handleDeleteOrder()}
      disabled={isLoading}
    >
      <Spinner loading={isLoading} />
      <FontAwesomeIcon icon={faTrashAlt} size="lg" /> Delete Project
    </button>
  );

  const getShareLink = () => {
    const link = `${window.location.origin}/projects/${order.ID}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copied!');
  };

  // TODO: add functionality to button
  const btnShare = !initialized ? (
    <Skeleton width={150} height={44} className="btn-share btn-secondary" />
  ) : (
    <button
      className="btn-share btn-secondary"
      aria-label="Share"
      type="button"
      onClick={() => getShareLink()}
      disabled={isLoading}
    >
      <Spinner loading={isLoading} />
      <FontAwesomeIcon icon={faShareAlt} size="lg" /> Share
    </button>
  );

  const openCreateProjectModel = () => {
    setShowModal(true);
  };

  const btnNew = !initialized ? (
    <Skeleton width={150} height={44} className="btn-new btn-secondary" />
  ) : (
    <button
      className="btn-new btn-secondary"
      aria-label="New Project"
      type="button"
      onClick={openCreateProjectModel}
      disabled={isLoading}
    >
      <Spinner loading={isLoading} />
      <FontAwesomeIcon icon={faPlus} size="lg" /> New Project
    </button>
  );

  const updateSelectedProject = (orderID: string) => {
    if (order.ID != orderID) {
      setIsLoading(true);
      clearCurrentOrder();
      dispatch(retrieveCart(orderID));
      setSelectedOrder(orderID);
      setIsLoading(false);
    }
  };

  const handleProjectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    updateSelectedProject(e.target.value);
  };

  const closeCreateProjectModel = () => {
    setShowModal(false);
  };

  const handleProjectNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setOrderName(e.target.value);
  };

  const handleModalSubmit = async () => {
    setIsLoading(true);
    setShowModal(false);
    const response = await dispatch(createNewOrder(orderName));
    setOrderName('');
    const order = response?.payload as Order;
    updateSelectedProject(order?.ID);
    setIsLoading(false);
  };

  const selectProject = !initialized ? (
    <Skeleton width={550} height={44} className="selected-project" />
  ) : (
    <select
      className="selected-project"
      required
      value={selectedOrder}
      onChange={handleProjectChange}
      disabled={isLoading}
    >
      {orders?.map((order) => (
        <option key={order.ID} value={order.ID}>
          {order.xp?.Name ? order.xp?.Name : order.ID}
        </option>
      ))}
    </select>
  );

  const modal = (
    <>
      <input
        type="checkbox"
        id="create-project-modal"
        className="modal-toggle"
        checked={showModal}
      />
      <div className="modal">
        <div className="modal-box relative">
          <label
            htmlFor="create-project-modal"
            className="btn btn-sm btn-circle absolute right-2 top-2"
            onClick={closeCreateProjectModel}
          >
            ✕
          </label>
          <h3 className="font-bold text-lg">New Project</h3>
          <div className="product-create-project form">
            <label htmlFor="projectName">Project Name</label>
            <input
              type="text"
              id="projectName"
              required
              onChange={handleProjectNameChange}
              value={orderName}
            />
          </div>
          <div className="modal-action">
            <label htmlFor="create-project-modal" className="btn-main" onClick={handleModalSubmit}>
              Continue
            </label>
          </div>
        </div>
      </div>
    </>
  );

  const getContent = () => {
    if (!isAnonymous) {
      return (
        <>
          <div className="manage-projects">
            <form className="form">
              {selectProject}
              {btnDelete}
              {btnShare}
              {btnNew}
            </form>
          </div>
          {modal}
        </>
      );
    } else {
      return <></>;
    }
  };

  return getContent();
};

export default OrderList;
