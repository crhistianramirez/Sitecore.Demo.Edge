import LineItemCard from 'components/Checkout/LineItemCard';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';
import Skeleton from 'react-loading-skeleton';
import useOcAuth from 'src/hooks/useOcAuth';
import useOcSharedProject from 'src/hooks/useOcSharedProject';
import { DLineItem } from 'src/models/ordercloud/DLineItem';
import { retrieveProject } from 'src/redux/ocSharedProject';
import { useAppDispatch } from 'src/redux/store';
import { ShopLayout } from '../../components/Products/Shop';

interface LineItemListProps {
  lineItems: DLineItem[];
  initialized: boolean;
  loading: boolean;
}
const LineItemList = (props: LineItemListProps): JSX.Element => {
  const { lineItems, initialized, loading } = props;
  const skeletonCount = 2;

  const getContent = () => {
    if (!initialized || loading) {
      return (
        // TODO: Refactor to avoid HTML repetition
        <ol className="line-item-list">
          {new Array(skeletonCount).fill('').map((_, index) => {
            return (
              <li key={index}>
                <div className="line-item-card">
                  <Skeleton containerClassName="skeleton-container" height={340} />
                </div>
              </li>
            );
          })}
        </ol>
      );
    } else if (lineItems?.length) {
      return (
        <ol className="line-item-list">
          {lineItems.map((lineItem) => (
            <li key={lineItem.ID}>
              <LineItemCard lineItem={lineItem} editable={false} />
            </li>
          ))}
        </ol>
      );
    } else {
      return <div>No items available for this project</div>;
    }
  };

  return getContent();
};

const SharedProject = (): JSX.Element => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useOcAuth();
  const { order, lineItems, loading, initialized } = useOcSharedProject();

  useEffect(() => {
    if (!router.query?.projectId || !isAuthenticated) {
      return;
    }
    dispatch(retrieveProject(router.query.projectId as string));
  }, [router.query?.projectId, dispatch, isAuthenticated]);

  return (
    <div className="cart-details shop-container">
      {!initialized || loading ? (
        <Skeleton containerClassName="skeleton-container" height={163} />
      ) : (
        <div>
          <h1>Project {order.xp.Name}</h1>
          <small>
            <strong>Created by</strong> {order.FromUser.FirstName + order.FromUser.LastName}
          </small>
          <br />
          <small>
            <strong># of Items</strong> {order.LineItemCount}
          </small>
        </div>
      )}
      <div className="cart-details-grid">
        <div className="cart-details-items">
          <LineItemList lineItems={lineItems} initialized={initialized} loading={loading} />
        </div>
      </div>
    </div>
  );
};

SharedProject.getLayout = function getLayout(page: ReactElement) {
  return (
    <ShopLayout>
      <Head>
        <title>PLAY! SHOP - Product</title>
      </Head>

      {page}
    </ShopLayout>
  );
};

export default SharedProject;
