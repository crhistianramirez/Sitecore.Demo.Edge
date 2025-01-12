// Type used to describe categories in categoriesData.ts
export type CategoriesDataCategory = {
  ccid: string;
  name: string;
  url_path: string;
  parent_ccid?: string;
  title?: string;
  desc?: string;
  image_url?: string;
};
