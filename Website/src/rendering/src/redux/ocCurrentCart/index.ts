import { createSlice, isAnyOf } from '@reduxjs/toolkit';
import {
  LineItems,
  Me,
  Orders,
  IntegrationEvents,
  RequiredDeep,
  ShipMethodSelection,
  Payments,
  PartialDeep,
  Tokens,
  LineItem,
} from 'ordercloud-javascript-sdk';
import { DAddress } from '../../models/ordercloud/DAddress';
import { DBuyerAddress } from '../../models/ordercloud/DBuyerAddress';
import { DLineItem } from '../../models/ordercloud/DLineItem';
import { DOrder } from '../../models/ordercloud/DOrder';
import { DOrderWorksheet } from '../../models/ordercloud/DOrderWorksheet';
import { DPayment } from '../../models/ordercloud/DPayment';
import { DOrderPromotion } from '../../models/ordercloud/DOrderPromotion';
import { DShipEstimateResponse } from '../../models/ordercloud/DShipEstimateResponse';
import { createOcAsyncThunk } from '../ocReduxHelpers';
import { DBuyerCreditCard } from '../../models/ordercloud/DCreditCard';
import axios from 'axios';
import { deleteCookie, getCookie } from '../../services/CookieService';
import { COOKIES_ANON_ORDER_ID, COOKIES_ANON_USER_TOKEN } from '../../constants/cookies';
import { DMeUser } from 'src/models/ordercloud/DUser';

export interface RecentOrder {
  order: RequiredDeep<DOrder>;
  lineItems: RequiredDeep<DLineItem>[];
  payments: RequiredDeep<DPayment>[];
}

export interface CreateLineItemRequest {
  orderId: string;
  lineItem: DLineItem;
}

export interface OcCurrentOrderState {
  initialized: boolean;
  orderTotalLoading: boolean; // true if any action occurs that may affect the cost of the order
  order?: RequiredDeep<DOrder>;
  lineItems?: RequiredDeep<DLineItem>[];
  payments?: RequiredDeep<DPayment>[];
  shipEstimateResponse?: RequiredDeep<DShipEstimateResponse>;
  promotions?: RequiredDeep<DOrderPromotion>[];
  shippingAddress?: RequiredDeep<DAddress>;
  orders?: RequiredDeep<DOrder>[];
}

const initialState: OcCurrentOrderState = {
  initialized: false,
  orderTotalLoading: false,
};

async function createOrder(orderId: string): Promise<RequiredDeep<DOrder>> {
  return await Orders.Create<DOrder>('All', { ID: orderId, xp: { DeliveryType: 'Ship' } });
}

export const removeAllPayments = createOcAsyncThunk<undefined, undefined>(
  'ocCurrentCart/removeAllPayments',
  async (_, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    if (ocCurrentCart.payments) {
      const requests = ocCurrentCart.payments.map((payment) => {
        return Payments.Delete('All', ocCurrentCart.order.ID, payment.ID);
      });
      await Promise.all(requests);
    }
    return undefined;
  }
);

export const updateCreditCardPayment = createOcAsyncThunk<
  RequiredDeep<DPayment>[],
  DBuyerCreditCard
>('ocCurrentCart/updateCreditCardPayment', async (creditCard, ThunkAPI) => {
  const { ocCurrentCart } = ThunkAPI.getState();
  const order = ocCurrentCart.order;
  const payment: DPayment = {
    Type: 'CreditCard',
    CreditCardID: creditCard?.ID,
    Amount: order.Total,
    xp: {
      CreditCard: creditCard,
      SpendingAccount: null,
    },
  };
  const response = await axios.put<RequiredDeep<DPayment>[]>(
    `/api/checkout/update-payments/${order.ID}`,
    { Payments: [payment] },
    { headers: { Authorization: `Bearer ${Tokens.GetAccessToken()}` } }
  );
  return response.data;
});

export const retrievePayments = createOcAsyncThunk<RequiredDeep<DPayment>[], string>(
  'ocCurrentCart/retrievePayments',
  async (orderId) => {
    const response = await Payments.List<DPayment>('All', orderId, { pageSize: 100 });
    return response.Items;
  }
);

export const retrievePromotions = createOcAsyncThunk<RequiredDeep<DOrderPromotion>[], string>(
  'ocCurrentCart/retrievePromotions',
  async (orderId) => {
    const response = await Orders.ListPromotions('All', orderId);
    return response.Items;
  }
);

export const removePromotion = createOcAsyncThunk<RequiredDeep<DOrderPromotion>, string>(
  'ocCurrentCart/removePromotion',
  async (promoCode, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    const orderId = ocCurrentCart.order.ID;
    return await Orders.RemovePromotion('All', orderId, promoCode);
  }
);

export const addPromotion = createOcAsyncThunk<RequiredDeep<DOrderPromotion>, string>(
  'ocCurrentCart/addPromotion',
  async (promoCode, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    const orderId = ocCurrentCart.order.ID;
    return await Orders.AddPromotion('All', orderId, promoCode);
  }
);

/**
 * Re-evaluates promotions applied to an order.
 * The order worksheet now provides promotions, so we may want to change this over.
 * @param {string} orderID The ID of the order that will have its applied promotions re-evaluated.
 * @return {RequiredDeep<DOrderPromotion>[]} The valid applied promotions of the order.
 */
export const refreshPromotions = createOcAsyncThunk<RequiredDeep<DOrderPromotion>[], string>(
  'ocCurrentCart/refreshPromotions',
  async (orderID, ThunkAPI) => {
    // The ordercloud api does not re-evaluate promotion discounts after initially applied
    // so if changes to line items are made we need to manually remove and re-add promotions so that they are applied
    const { ocCurrentCart } = ThunkAPI.getState();
    const promotions = ocCurrentCart.promotions;

    // delete all promos on order
    const removePromos = promotions.map((p) => Orders.RemovePromotion('All', orderID, p.Code));
    await Promise.all(removePromos);

    // add all promos back
    const addPromos = promotions.map((p) => Orders.AddPromotion('All', orderID, p.Code));
    return await Promise.all(addPromos);
  }
);

/**
 * Merges line items of an anonymous order with an existing order.
 * It will create a new order if an existing order is not available (while a transfer order
 * would make sense, this implementation does not attempt to transfer other aspects of the
 * order across, e.g. promotions, shipping address, etc.)
 * @param {RequiredDeep<DOrder>} existingOrder The existing order.
 * @return {Promise<RequiredDeep<DOrder>>} The existing order with merged line items.
 */
const mergeAnonOrder = async (
  existingOrder: RequiredDeep<DOrder>
): Promise<RequiredDeep<DOrder>> => {
  const anonOrderID = getCookie(COOKIES_ANON_ORDER_ID);
  const anonUserToken = getCookie(COOKIES_ANON_USER_TOKEN);
  deleteCookie(COOKIES_ANON_ORDER_ID);
  deleteCookie(COOKIES_ANON_USER_TOKEN);
  if (!anonOrderID || !anonUserToken) {
    return undefined;
  }

  if (!existingOrder) {
    // TODO: Potential invalid path.
    // The transferAnonOrder should have been executed in this case.
    existingOrder = await createOrder(null);
  }

  const profiledWorksheet = await IntegrationEvents.GetWorksheet('All', existingOrder.ID);
  const profiledLineItems = profiledWorksheet.LineItems;
  const profiledProductIDs = profiledLineItems.map((lineItem) => lineItem.ProductID);

  // user started adding items to their cart anonymously and then signed in
  // we must merge those anonymous line items into their profiled cart
  // we're purposely not using the transfer order endpoint because it doesn't handle a merge
  // scenario it only transfers the order as a whole so we would still need to perform the same API calls here
  // plus the transfer and then delete of the transferred order so it isn't really doesn't make sense
  const anonLineItems = await LineItems.List(
    'All',
    anonOrderID,
    { pageSize: 100 },
    { accessToken: anonUserToken }
  );
  const lineItemCreateRequests = anonLineItems.Items.filter(
    (lineItem) => !profiledProductIDs.includes(lineItem.ProductID)
  ).map((anonLineItem) => {
    try {
      LineItems.Create('All', existingOrder.ID, {
        ProductID: anonLineItem.ProductID,
        Quantity: anonLineItem.Quantity,
      });
    } catch {
      // swallow error, an error here doesn't have much recourse and isn't fatal
      // additionally it may be a legitimate error if for example the profiled user does not have access
      // to a product that the public user does
    }
  });
  const lineItemUpdateRequests = anonLineItems.Items.filter((lineItem) =>
    profiledProductIDs.includes(lineItem.ProductID)
  ).map((anonLineItem) => {
    const profiledLineItem = profiledLineItems.find(
      (lineItem) => lineItem.ProductID === anonLineItem.ProductID
    );
    try {
      LineItems.Patch('All', existingOrder.ID, profiledLineItem.ID, {
        Quantity: profiledLineItem.Quantity + anonLineItem.Quantity,
      });
    } catch {
      // swallow error, an error here doesn't have much recourse and isn't fatal
      // additionally it may be a legitimate error if for example the profiled user does not have access
      // to a product that the public user does
    }
  });
  await Promise.all([...lineItemCreateRequests, ...lineItemUpdateRequests]);
  return existingOrder;
};

/**
 * Retrieves a user's order. If an orderId is specified, the
 * Merging an anonymous order should be the responsibility of this function. It should be moved over to the login process.
 * @param {number} num1 The first number to add.
 * @param {number} num2 The second number to add.
 * @return {number} The result of adding num1 and num2.
 */
export const retrieveCart = createOcAsyncThunk<RequiredDeep<DOrderWorksheet> | undefined, string>(
  'ocCurrentCart/retrieveCart',
  async (orderID, ThunkAPI) => {
    if (!orderID) {
      const me = await Me.Get();
      orderID = me.xp?.defaultOrderID;
    }

    // TODO: change searchOn to filter for exact match.
    const response = orderID
      ? await Me.ListOrders<DOrder>({
          sortBy: ['DateCreated'],
          filters: { Status: 'Unsubmitted' },
          search: orderID,
          searchOn: ['ID'],
        })
      : await Me.ListOrders<DOrder>({
          sortBy: ['DateCreated'],
          filters: { Status: 'Unsubmitted' },
        });
    let existingOrder = response.Items[0];

    // TODO: Move to login.ts after calling retrieveCart()
    const mergedAnonOrder = await mergeAnonOrder(existingOrder);
    if (mergedAnonOrder) {
      existingOrder = mergedAnonOrder;
    }

    if (existingOrder) {
      const worksheet = await IntegrationEvents.GetWorksheet<DOrderWorksheet>(
        'All',
        existingOrder.ID
      );
      if (
        worksheet.Order.BillingAddress &&
        worksheet.ShipEstimateResponse &&
        worksheet.ShipEstimateResponse.ShipEstimates &&
        worksheet.ShipEstimateResponse.ShipEstimates.length &&
        worksheet.ShipEstimateResponse.ShipEstimates.filter((se) => !se.SelectedShipMethodID)
          .length === 0
      ) {
        ThunkAPI.dispatch(retrievePayments(existingOrder.ID));
      }
      ThunkAPI.dispatch(retrievePromotions(existingOrder.ID));
      if (mergedAnonOrder) {
        // This is a bit of a hack but since we're updating the cart right before we get the worksheet
        // there can be a race condition where the order worksheet is stale so anytime we merge an order
        // get the order worksheet once more
        return IntegrationEvents.GetWorksheet<DOrderWorksheet>('All', existingOrder.ID);
      }

      if (!orderID) {
        Me.Patch<DMeUser>({ xp: { defaultOrderID: existingOrder.ID } });
      }

      return worksheet;
    }
    return undefined;
  }
);

export const patchOrder = createOcAsyncThunk<RequiredDeep<DOrder>, PartialDeep<DOrder>>(
  'ocCurrentCart/patch',
  async (partialOrder, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    const orderID = ocCurrentCart.order.ID;
    if (partialOrder?.xp?.DeliveryType === 'Ship') {
      await ThunkAPI.dispatch(removeShippingAddress());
    }
    return await Orders.Patch('All', orderID, partialOrder);
  }
);

export const deleteCurrentOrder = createOcAsyncThunk<void, void>(
  'ocCurrentCart/delete',
  async (_, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    if (ocCurrentCart.order) {
      await Orders.Delete('All', ocCurrentCart.order.ID);
    }
    // eslint-disable-next-line no-use-before-define
    ThunkAPI.dispatch(clearCurrentOrder());
    ThunkAPI.dispatch(retrieveCart(null));
  }
);

export const transferAnonOrder = createOcAsyncThunk<void, string>(
  'ocCurrentCart/transfer',
  async (anonUserToken, ThunkAPI) => {
    await Me.TransferAnonUserOrder({ anonUserToken });
    ThunkAPI.dispatch(retrieveCart(null));
  }
);

/**
 * Creates or updates a line item on an order. i.e. line item roll up is enabled.
 * If the orderId is provided, the current order will be updated accordingly.
 * If the order does not exist it will be created.
 * Triggers validation of promotions upon completion.
 * @param {CreateLineItemRequest} request The lineitem and (optional) orderId.
 * @return {RequiredDeep<DOrderWorksheet>} The updated order worksheet.
 */
export const createLineItem = createOcAsyncThunk<
  RequiredDeep<DOrderWorksheet>,
  CreateLineItemRequest
>('ocCurrentCart/createLineItem', async (request, ThunkAPI) => {
  let ocCurrentCart = ThunkAPI.getState().ocCurrentCart;
  let orderId;
  const currentOrderId = ocCurrentCart.order ? ocCurrentCart.order.ID : undefined;

  if (!!request.orderId && request.orderId != currentOrderId) {
    await ThunkAPI.dispatch(retrieveCart(request.orderId));

    // Do we need to getState again after the above?
    ocCurrentCart = ThunkAPI.getState().ocCurrentCart;
    orderId = ocCurrentCart.order ? ocCurrentCart.order.ID : undefined;
  }

  // initialize the order if it doesn't exist already
  if (!orderId) {
    const orderResponse = await createOrder(request.orderId);
    orderId = orderResponse.ID;
    // refresh order(s) states
    await ThunkAPI.dispatch(retrieveCart(orderId));
    ThunkAPI.dispatch(retrieveOrders());
    ocCurrentCart = ThunkAPI.getState().ocCurrentCart;
  }

  // Determine if the line item is already in the cart
  const lineItemAlreadyInCart = ocCurrentCart.lineItems?.find((lineItem: LineItem) => {
    if (
      lineItem.ProductID != request.lineItem.ProductID ||
      lineItem.Specs.length !== request.lineItem.Specs.length
    ) {
      return null;
    }
    const allSpecsMatch = lineItem.Specs.every((existingLineItemSpec) => {
      return request.lineItem.Specs.some((spec) => {
        return spec.OptionID === existingLineItemSpec.OptionID;
      });
    });
    return allSpecsMatch || lineItem.Specs.length === 0 ? lineItem : null;
  });

  if (!lineItemAlreadyInCart) {
    await LineItems.Create<DLineItem>('All', orderId, request.lineItem);
  } else {
    request.lineItem.Quantity += lineItemAlreadyInCart.Quantity;
    request.lineItem.xp.StatusByQuantity.Submitted += lineItemAlreadyInCart.Quantity;
    await LineItems.Patch<DLineItem>('All', orderId, lineItemAlreadyInCart.ID, request.lineItem);
  }

  if (ocCurrentCart.promotions?.length) {
    ThunkAPI.dispatch(refreshPromotions(orderId));
  }

  return IntegrationEvents.GetWorksheet<DOrderWorksheet>('All', orderId);
});

export const updateLineItem = createOcAsyncThunk<RequiredDeep<DOrderWorksheet>, DLineItem>(
  'ocCurrentCart/updateLineItem',
  async (request, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    const orderId = ocCurrentCart.order.ID;

    await LineItems.Save<DLineItem>('All', orderId, request.ID, request);
    if (ocCurrentCart.promotions?.length) {
      ThunkAPI.dispatch(refreshPromotions(orderId));
    }

    return IntegrationEvents.GetWorksheet<DOrderWorksheet>('All', orderId);
  }
);

export const patchLineItem = createOcAsyncThunk<
  RequiredDeep<DOrderWorksheet>,
  { lineItemID: string; partialLineItem: PartialDeep<DLineItem> }
>('ocCurrentCart/patchLineItem', async (request, ThunkAPI) => {
  const { ocCurrentCart } = ThunkAPI.getState();
  const orderId = ocCurrentCart.order.ID;

  await LineItems.Patch<DLineItem>('All', orderId, request.lineItemID, request.partialLineItem);
  if (ocCurrentCart.promotions?.length) {
    ThunkAPI.dispatch(refreshPromotions(orderId));
  }

  return IntegrationEvents.GetWorksheet<DOrderWorksheet>('All', orderId);
});

export const removeLineItem = createOcAsyncThunk<RequiredDeep<DOrderWorksheet>, string>(
  'ocCurrentCart/removeLineItem',
  async (request, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    const orderId = ocCurrentCart.order.ID;
    await LineItems.Delete('All', orderId, request);
    if (ocCurrentCart.promotions?.length) {
      ThunkAPI.dispatch(refreshPromotions(orderId));
    }
    return IntegrationEvents.GetWorksheet<DOrderWorksheet>('All', orderId);
  }
);

export const saveShippingAddress = createOcAsyncThunk<
  RequiredDeep<DOrderWorksheet>,
  Partial<DBuyerAddress>
>('ocCurrentCart/saveShippingAddress', async (request, ThunkAPI) => {
  const { ocCurrentCart, ocAuth } = ThunkAPI.getState();
  const orderId = ocCurrentCart.order ? ocCurrentCart.order.ID : undefined;
  if (!orderId) {
    throw new Error('No order ID');
  }

  if (request) {
    if (request.ID && !ocAuth.isAnonymous) {
      await Orders.Patch<DOrder>('All', orderId, { ShippingAddressID: request.ID });
    } else {
      await Orders.SetShippingAddress<DOrder>('All', orderId, request as DAddress);
    }
  } else {
    await Orders.Patch<DOrder>('All', orderId, { ShippingAddressID: null });
  }

  return IntegrationEvents.GetWorksheet<DOrderWorksheet>('All', orderId);
});

export const removeShippingAddress = createOcAsyncThunk<RequiredDeep<DOrderWorksheet>, undefined>(
  'ocCurrentCart/removeShippingAddress',
  async (_, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    const { order } = ocCurrentCart;

    if (!order?.ID) {
      throw new Error('No order ID');
    }

    await Orders.Patch<DOrder>('All', order.ID, { ShippingAddressID: null });

    return IntegrationEvents.Calculate<DOrderWorksheet>('All', order.ID);
  }
);

export const saveBillingAddress = createOcAsyncThunk<
  RequiredDeep<DOrderWorksheet>,
  Partial<DBuyerAddress>
>('ocCurrentCart/saveBillingAddress', async (request, ThunkAPI) => {
  const { ocCurrentCart, ocAuth } = ThunkAPI.getState();
  const orderId = ocCurrentCart.order ? ocCurrentCart.order.ID : undefined;

  if (!orderId) {
    throw new Error('No order ID');
  }
  if (request.ID && !ocAuth.isAnonymous) {
    await Orders.Patch<DOrder>('All', orderId, { BillingAddressID: request.ID });
  } else {
    await Orders.SetBillingAddress<DOrder>('All', orderId, request as DAddress);
  }

  return IntegrationEvents.Calculate<DOrderWorksheet>('All', orderId);
});

export const removeBillingAddress = createOcAsyncThunk<RequiredDeep<DOrderWorksheet>, undefined>(
  'ocCurrentCart/removeBillingAddress',
  async (_, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    const { order } = ocCurrentCart;

    if (!order?.ID) {
      throw new Error('No order ID');
    }

    await Orders.Patch<DOrder>('All', order.ID, { BillingAddressID: null });

    return IntegrationEvents.Calculate<DOrderWorksheet>('All', order.ID);
  }
);

export const estimateShipping = createOcAsyncThunk<RequiredDeep<DOrderWorksheet>, string>(
  'ocCurrentCart/estimateShipping',
  async (orderId) => {
    const response = await IntegrationEvents.EstimateShipping<DOrderWorksheet>('All', orderId);
    return response;
  }
);

export const selectShipMethods = createOcAsyncThunk<
  RequiredDeep<DOrderWorksheet>,
  RequiredDeep<ShipMethodSelection>[]
>('ocCurrentCart/selectShipMethods', async (selection, ThunkAPI) => {
  const { ocCurrentCart } = ThunkAPI.getState();
  const response = await IntegrationEvents.SelectShipmethods<DOrderWorksheet>(
    'All',
    ocCurrentCart.order.ID,
    {
      ShipMethodSelections: selection,
    }
  );
  ThunkAPI.dispatch(removeAllPayments());
  if (ocCurrentCart.order.BillingAddress) {
    return IntegrationEvents.Calculate<DOrderWorksheet>('All', ocCurrentCart.order.ID);
  }
  return response;
});

export const removePayment = createOcAsyncThunk<string, string>(
  'ocCurrentCart/removePayment',
  async (paymentId, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    await Payments.Delete('All', ocCurrentCart.order.ID, paymentId);
    return paymentId;
  }
);

export const submitOrder = createOcAsyncThunk<RecentOrder, (orderID: string) => void>(
  'ocCurrentCart/submit',
  async (_, ThunkAPI) => {
    const { ocCurrentCart } = ThunkAPI.getState();
    await Orders.Validate('All', ocCurrentCart.order.ID);
    const submitResponse = await Orders.Submit<DOrder>('All', ocCurrentCart.order.ID);
    // eslint-disable-next-line no-use-before-define
    ThunkAPI.dispatch(clearCurrentOrder());
    return {
      order: submitResponse,
      lineItems: ocCurrentCart.lineItems,
      payments: ocCurrentCart.payments,
    };
  }
);

export const retrieveOrders = createOcAsyncThunk<RequiredDeep<DOrder>[] | undefined, void>(
  'ocActiveOrders/retrieveOrders',
  async () => {
    const response = await Me.ListOrders<DOrder>({
      sortBy: ['DateCreated'],
      filters: { Status: 'Unsubmitted' },
    });
    return response.Items;
  }
);

const thunksThatAffectOrderTotal = [
  removeAllPayments,
  refreshPromotions,
  createLineItem,
  updateLineItem,
  patchLineItem,
  removeLineItem,
  saveBillingAddress,
  removeBillingAddress,
  selectShipMethods,
];
const pendingThunksThatAffectOrderTotal = thunksThatAffectOrderTotal.map((thunk) => thunk.pending);
const fulfilledThunksThatAffectOrderTotal = thunksThatAffectOrderTotal.map(
  (thunk) => thunk.fulfilled
);

const isOrderTotalLoading = isAnyOf(
  pendingThunksThatAffectOrderTotal[0],
  ...pendingThunksThatAffectOrderTotal
);
const isOrderTotalNotLoading = isAnyOf(
  fulfilledThunksThatAffectOrderTotal[0],
  ...fulfilledThunksThatAffectOrderTotal
);

const ocCurrentCartSlice = createSlice({
  name: 'ocCurrentCart',
  initialState,
  reducers: {
    clearCurrentOrder: (state) => {
      state.order = undefined;
      state.lineItems = undefined;
      state.shipEstimateResponse = undefined;
      state.payments = undefined;
      state.initialized = false;
      state.promotions = undefined;
    },
    clearAllOrders: (state) => {
      state.orders = undefined;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(retrieveOrders.fulfilled, (state, action) => {
      if (action.payload) {
        state.orders = action.payload;
        state.initialized = true;
      }
    });
    builder.addCase(retrieveCart.fulfilled, (state, action) => {
      if (action.payload) {
        state.order = action.payload.Order;
        state.lineItems = action.payload.LineItems;
        state.promotions = action.payload.OrderPromotions;
        state.shippingAddress = state.lineItems?.length ? state.lineItems[0].ShippingAddress : null;
        state.shipEstimateResponse = action.payload.ShipEstimateResponse;
        state.initialized = true;
      } else {
        state.order = undefined;
        state.lineItems = undefined;
        state.shipEstimateResponse = undefined;
        state.shippingAddress = undefined;
        state.payments = undefined;
        state.promotions = undefined;
        state.initialized = true;
      }
    });
    builder.addCase(patchOrder.fulfilled, (state, action) => {
      if (action.payload) {
        state.order = action.payload;
      }
    });
    builder.addCase(retrievePromotions.fulfilled, (state, action) => {
      if (action.payload) {
        state.promotions = action.payload;
      }
    });
    builder.addCase(removePromotion.fulfilled, (state, action) => {
      if (action.payload) {
        state.promotions = state.promotions.filter((p) => p.ID === action.payload.ID);
      }
    });
    builder.addCase(addPromotion.fulfilled, (state, action) => {
      if (action.payload) {
        state.promotions = [...state.promotions, action.payload];
      }
    });
    builder.addCase(refreshPromotions.fulfilled, (state, action) => {
      if (action.payload) {
        state.promotions = action.payload;
      }
    });
    builder.addCase(createLineItem.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(updateLineItem.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(patchLineItem.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(removeLineItem.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(saveShippingAddress.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shippingAddress = action.payload.LineItems?.length
        ? action.payload.LineItems[0].ShippingAddress
        : null;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(saveBillingAddress.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(removeBillingAddress.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(removeShippingAddress.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shippingAddress = null;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(estimateShipping.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(selectShipMethods.fulfilled, (state, action) => {
      state.order = action.payload.Order;
      state.lineItems = action.payload.LineItems;
      state.shipEstimateResponse = action.payload.ShipEstimateResponse;
    });
    builder.addCase(retrievePayments.fulfilled, (state, action) => {
      state.payments = action.payload;
    });
    builder.addCase(removeAllPayments.fulfilled, (state) => {
      state.payments = [];
    });
    builder.addCase(updateCreditCardPayment.fulfilled, (state, action) => {
      state.payments = action.payload;
    });
    builder.addCase(submitOrder.fulfilled, (_, action) => {
      action.meta.arg(action.payload.order.ID);
    });

    // Matchers must come last after all cases
    builder.addMatcher(isOrderTotalLoading, (state) => {
      state.orderTotalLoading = true;
    });
    builder.addMatcher(isOrderTotalNotLoading, (state) => {
      state.orderTotalLoading = false;
    });
  },
});

export const { clearCurrentOrder, clearAllOrders } = ocCurrentCartSlice.actions;

export default ocCurrentCartSlice.reducer;
