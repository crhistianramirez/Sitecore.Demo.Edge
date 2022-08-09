import { createSlice } from '@reduxjs/toolkit';
import { IntegrationEvents, RequiredDeep } from 'ordercloud-javascript-sdk';
import { createOcAsyncThunk } from '../ocReduxHelpers';
import { DOrder } from 'src/models/ordercloud/DOrder';
import { DLineItem } from 'src/models/ordercloud/DLineItem';

export interface OcSharedProjectState {
  initialized: boolean;
  loading: boolean;
  order: DOrder;
  lineItems: DLineItem[];
}

export const retrieveProject = createOcAsyncThunk<
  { order: RequiredDeep<DOrder>; lineItems: RequiredDeep<DLineItem>[] },
  string
>('ocSharedProject/retrieveProject', async (orderId: string) => {
  const worksheet = await IntegrationEvents.GetWorksheet('All', orderId);
  return {
    order: worksheet.Order,
    lineItems: worksheet.LineItems,
  };
});

const ocSharedProjectSlice = createSlice({
  name: 'ocSharedProject',
  initialState: {
    initialized: false,
    loading: false,
    order: null,
    lineItems: [],
  },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(retrieveProject.fulfilled, (state, action) => {
      state.loading = false;
      state.initialized = true;
      state.order = action.payload.order;
      state.lineItems = action.payload.lineItems;
    });
    builder.addCase(retrieveProject.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(retrieveProject.rejected, (state) => {
      state.loading = false;
      state.order = null;
      state.lineItems = [];
    });
  },
});

export default ocSharedProjectSlice.reducer;
