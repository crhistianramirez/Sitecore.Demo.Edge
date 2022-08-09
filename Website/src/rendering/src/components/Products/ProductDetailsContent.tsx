import Head from 'next/head';
import {
  BuyerProduct,
  LineItem,
  RequiredDeep,
  Spec,
  Variant,
} from 'ordercloud-javascript-sdk';
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { createLineItem } from '../../redux/ocCurrentCart';
import useOcAuth from '../../hooks/useOcAuth';
import useOcCurrentCart from '../../hooks/useOcCurrentCart';
import { useAppDispatch, useAppSelector } from '../../redux/store';
import QuantityInput from '../ShopCommon/QuantityInput';
import ProductSpecList, { OrderCloudSpec } from './ProductSpecList';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-regular-svg-icons';
import { faHistory } from '@fortawesome/free-solid-svg-icons';
import Price from '../ShopCommon/Price';
import ProductOverview from './ProductOverview';
import ProductImage from './ProductImage';
import { logAddToCart } from '../../services/CdpService';
import ProductBreadcrumb from '../Navigation/ProductBreadcrumb';
import { Actions, PageController } from '@sitecore-discover/react';
import Spinner from '../../components/ShopCommon/Spinner';
import Skeleton from 'react-loading-skeleton';

interface ProductDetailsContentProps {
  variantID?: string;
  product: RequiredDeep<BuyerProduct>;
  specs: RequiredDeep<Spec>[];
  variants: RequiredDeep<Variant>[];
  initialLoading?: boolean;
}

const ProductDetailsContent = ({
  variantID,
  product,
  specs,
  variants,
  initialLoading,
}: ProductDetailsContentProps): JSX.Element => {
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [specValues, setSpecValues] = useState<OrderCloudSpec[]>([]);
  const [variant, setVariant] = useState<Variant>(undefined);
  const { isAnonymous, isAuthenticated } = useOcAuth();
  const currentOrderState = useOcCurrentCart();
  const loading = initialLoading || isLoading;

  const pageTitle = loading ? 'loading...' : product ? product.Name : 'Product not found';

  const isUserLoggedIn = !isAnonymous && isAuthenticated;

  // Handle LineItem edits
  const lineItemId = '';
  const lineItem = useAppSelector((slice) =>
    lineItemId && slice.ocCurrentCart.lineItems
      ? slice.ocCurrentCart.lineItems.find((lineItem) => lineItem.ID === lineItemId)
      : undefined
  );
  const [quantity, setQuantity] = useState(
    lineItem ? lineItem.Quantity : (product && product.PriceSchedule.MinQuantity) || 1
  );

  const [orderId, setOrderId] = useState(currentOrderState.order?.ID);
  const [createNewProject, setCreateNewProject] = useState(!orderId);
  const [orderName, setOrderName] = useState('');
  const [showModal, setShowModal] = useState(false);

  const determineDefaultOptionId = (spec: Spec) => {
    if (spec.DefaultOptionID) {
      return spec.DefaultOptionID;
    }

    return spec.OptionCount ? spec.Options[0].ID : undefined;
  };

  useEffect(() => {
    setOrderId(currentOrderState.order?.ID);
    setCreateNewProject(!currentOrderState.order?.ID);
  }, [currentOrderState.order?.ID]);

  // Set the spec values on inital load and when the URL changes
  useEffect(() => {
    if (lineItem) {
      setSpecValues(lineItem.Specs);
    } else {
      let specVals: OrderCloudSpec[] = [];

      if (specs) {
        specVals = specs.map((spec) => {
          return {
            SpecID: spec.ID,
            OptionID: determineDefaultOptionId(spec),
            Value: spec.DefaultValue ? spec.DefaultValue : undefined,
          };
        });
      }

      if (variants) {
        if (variantID) {
          const tempVariant = variants.find((listedvariant) => listedvariant.ID == variantID);
          specVals = specVals.map((specValue) => {
            const variantSpec = tempVariant.Specs.find((spec) => spec.SpecID == specValue.SpecID);
            return {
              SpecID: specValue.SpecID,
              OptionID: variantSpec ? variantSpec.OptionID : specValue.OptionID,
              Value: undefined,
            };
          });
        }
      }

      setSpecValues(specVals);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItem, specs, variants, variantID]);

  // Set the variant when specs are updated
  useEffect(() => {
    if (variants && specValues.length > 0) {
      const variantDefinitionSpecs: { SpecID: string; OptionID: string }[] = [];

      specs.forEach((spec) => {
        if (spec.DefinesVariant) {
          specValues.forEach((specvalue) => {
            if (specvalue.SpecID == spec.ID) {
              const tempSpec = {
                SpecID: specvalue.SpecID,
                OptionID: specvalue.OptionID,
              };
              variantDefinitionSpecs.push(tempSpec);
            }
          });
        }
      });

      for (let i = 0; i < variants.length; i++) {
        const totalSpecs = variantDefinitionSpecs.length;
        let specsFound = 0;

        variants[i].Specs.forEach((spec) => {
          const tempSpec = {
            SpecID: spec.SpecID,
            OptionID: spec.OptionID,
          };
          const testOne = JSON.stringify(variantDefinitionSpecs);
          const testTwo = JSON.stringify(tempSpec);

          if (testOne.indexOf(testTwo) != -1) {
            specsFound++;
          }
        });

        if (specsFound == totalSpecs) {
          setVariant(variants[i]);
          break;
        }
      }
    } else {
      setVariant(undefined);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specValues, variants]);

  const handleSpecFieldChange = (values: OrderCloudSpec) => {
    const tempSpecs: OrderCloudSpec[] = specValues.map((spec) => {
      if (spec.SpecID === values.SpecID) {
        return {
          SpecID: values.SpecID,
          OptionID: values.OptionID === 'OpenText' ? undefined : values.OptionID,
          Value: values.Value,
        };
      }
      return spec;
    });

    setSpecValues(tempSpecs);
  };

  const dispatchDiscoverAddToCartEvent = useCallback(
    (product: BuyerProduct, quantity: number) => {
      const sku = !!variant ? variant.ID : product.ID;

      PageController.getDispatcher().dispatch({
        type: Actions.ADD_TO_CART,
        payload: {
          page: 'pdp',
          sku: sku,
          quantity: quantity,
          price:
            product.PriceSchedule.PriceBreaks[0].SalePrice ||
            product.PriceSchedule.PriceBreaks[0].Price,
          priceOriginal: product.PriceSchedule.PriceBreaks[0].Price,
        },
      });
    },
    [variant]
  );

  const handleAddToCart = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      const response = await dispatch(
        createLineItem({
          orderId: orderId != '' ? orderId : null,
          orderName: orderName,
          lineItem: {
            ProductID: product.ID,
            Quantity: quantity,
            Specs: specValues,
            xp: {
              StatusByQuantity: {
                Submitted: quantity,
                Open: 0,
                Backordered: 0,
                Canceled: 0,
                CancelRequested: 0,
                CancelDenied: 0,
                Returned: 0,
                ReturnRequested: 0,
                ReturnDenied: 0,
                Complete: 0,
              },
            },
          },
        })
      );
      setIsLoading(false);

      dispatchDiscoverAddToCartEvent(product, quantity);

      // Retrieve the lineitem that was just created
      const resPayload: { LineItems?: LineItem[] } = response?.payload;
      const lineItem = resPayload?.LineItems.find((item) => item.ProductID === product.ID);

      logAddToCart(lineItem, quantity);
    },
    [dispatch, orderId, orderName, product, quantity, specValues, dispatchDiscoverAddToCartEvent]
  );

  const productImageProps =
    variant?.xp?.Images?.length > 0 && variant.xp.Images[0]?.Url
      ? variant.xp.Images
      : product?.xp?.Images?.length > 0 && product.xp.Images[0]?.Url
      ? product.xp.Images
      : [];

  // TODO: add functionality to button
  const btnWishList = initialLoading ? (
    <Skeleton width={27} height={27} className="btn-wishlist" />
  ) : (
    <button className="btn-wishlist" aria-label="Add to Wish List" type="button">
      <FontAwesomeIcon icon={faHeart} size="lg" />
    </button>
  );

  // TODO: add functionality to button
  const btnSaveLater = initialLoading ? (
    <Skeleton width={27} height={27} className="btn-later" />
  ) : (
    <button className="btn-later" aria-label="Save for Later" type="button">
      <FontAwesomeIcon icon={faHistory} size="lg" />
    </button>
  );

  // TODO: add functionality to field
  const quantityAlert = initialLoading ? (
    <Skeleton className="quantity-alert" width={88} />
  ) : (
    <p className="quantity-alert">Only 3 left!</p>
  );

  const priceProps = {
    price: !loading && product.PriceSchedule.PriceBreaks[0].Price,
    finalPrice:
      !loading &&
      (product.PriceSchedule.PriceBreaks[0].SalePrice ||
        product.PriceSchedule.PriceBreaks[0].Price),
  };

  // TODO: get actual data
  const overviewProps = {
    items: [
      {
        heading: 'Full Description',
        description: product?.Description,
        disabled: false,
      },
      {
        heading: 'Product Details',
        description: product?.Description,
        disabled: false,
      },
      {
        heading: 'Delivery Info',
        description: product?.Description,
        disabled: false,
      },
      {
        heading: 'Return Policy',
        description: product?.Description,
        disabled: true,
      },
    ],
  };

  const btnText = `${lineItem ? 'Update' : 'Add To'} Cart`;

  const openCreateProjectModel = () => {
    setShowModal(true);
  };

  const closeCreateProjectModel = () => {
    setShowModal(false);
  };

  const btnAddToCart = initialLoading ? (
    <Skeleton className="btn-main" width={168} />
  ) : createNewProject ? (
    <button type="button" className="btn-main" onClick={openCreateProjectModel}>
      {btnText}
    </button>
  ) : (
    <button type="submit" className="btn-main" disabled={loading}>
      <Spinner loading={loading} />
      {btnText}
    </button>
  );

  const handleProjectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const projectId = e.target.value;
    setOrderId(projectId);
    setCreateNewProject(projectId === '');
  };

  const handleProjectNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setOrderName(e.target.value);
  };

  const handleModalSubmit = (e: FormEvent) => {
    setShowModal(false);
    handleAddToCart(e);
    setOrderName('');
  };

  const selectProject = isUserLoggedIn ? (
    initialLoading || !currentOrderState.initialized ? (
      <Skeleton className="selected-project" />
    ) : (
      <select
        className="selected-project"
        required
        defaultValue={currentOrderState.order?.ID}
        onChange={handleProjectChange}
        value={orderId}
        disabled={loading}
      >
        {currentOrderState.orders?.map((order) => (
          <option key={order.ID} value={order.ID}>
            {order.xp?.Name ? order.xp?.Name : order.ID}
          </option>
        ))}
        <option key="new" value="">
          - Create new project -
        </option>
      </select>
    )
  ) : (
    <></>
  );

  const productAddToCart = (
    <div className="product-add-to-cart form">
      {selectProject}
      {btnAddToCart}
      {btnSaveLater}
      {btnWishList}
    </div>
  );

  const productName = initialLoading ? <Skeleton width={300} /> : product?.Name;
  const productBrand = initialLoading ? <Skeleton width={300} /> : product?.xp?.Brand;

  const productBreadcrumb = initialLoading ? (
    <Skeleton width={300} />
  ) : product ? (
    <ProductBreadcrumb
      productName={product.Name}
      productUrl={product.xp?.ProductUrl}
      ccid={product.xp?.CCID}
    />
  ) : null;

  const productDetails =
    loading || product ? (
      <section className="section">
        <div className="shop-container">
          <div className="product-details">
            <div className="product-details-hero">
              <div className="product-breadcrumb">{productBreadcrumb}</div>
              <h2 className="product-name">{productName}</h2>
              <h3 className="product-brand">{productBrand}</h3>
              <ProductImage images={productImageProps} loading={initialLoading} />
              <div className="product-description">
                <form onSubmit={handleAddToCart}>
                  <ProductSpecList
                    specs={specs}
                    specValues={specValues}
                    onChange={handleSpecFieldChange}
                  />
                  <div className="product-quantity">
                    <QuantityInput
                      controlId={variantID}
                      priceSchedule={product?.PriceSchedule}
                      initialQuantity={quantity}
                      onChange={setQuantity}
                      loading={loading}
                    />
                    {quantityAlert}
                  </div>
                  <Price {...priceProps} altTheme sizeL loading={initialLoading} />
                  {productAddToCart}
                </form>
              </div>
              <ProductOverview {...overviewProps} loading={initialLoading} />
            </div>
          </div>
        </div>
      </section>
    ) : (
      <div>Product not found</div>
    );

  const modal = (
    <>
      <input
        type="checkbox"
        id="create-project-modal"
        className="modal-toggle"
        checked={showModal} />
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

  return (
    <>
      <Head>
        <title>PLAY! SHOP - {pageTitle}</title>
      </Head>
      {productDetails}
      {modal}
    </>
  );
};

export default ProductDetailsContent;
