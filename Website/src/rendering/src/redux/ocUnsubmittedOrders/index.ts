import { createSlice } from '@reduxjs/toolkit';
import { Me, Orders, RequiredDeep } from 'ordercloud-javascript-sdk';
import { DOrder } from '../../models/ordercloud/DOrder';
import { createOcAsyncThunk } from '../ocReduxHelpers';

export interface OcUnsubmittedOrdersState {
  initialized: boolean;
  orders?: RequiredDeep<DOrder>[];
}

const initialState: OcUnsubmittedOrdersState = {
  initialized: false,
};

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

export const createOrder = createOcAsyncThunk<RequiredDeep<DOrder>, string>(
  'ocActiveOrders/createOrder',
  async (orderId, ThunkAPI) => {
    const order = await Orders.Create<DOrder>('All', { ID: orderId, xp: { DeliveryType: 'Ship' } });
    ThunkAPI.dispatch(retrieveOrders());
    return order;
  }
);

const ocActiveOrdersSlice = createSlice({
  name: 'ocActiveOrders',
  initialState,
  reducers: {
    clearAllOrders: (state) => {
      state.orders = undefined;
      state.initialized = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(retrieveOrders.fulfilled, (state, action) => {
      if (action.payload) {
        state.orders = action.payload;
        state.initialized = true;
      }
    });
  },
});

export const { clearAllOrders } = ocActiveOrdersSlice.actions;

export default ocActiveOrdersSlice.reducer;
