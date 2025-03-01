export interface Root {
  status: string;
  data: Data;
}

export interface Data {
  headers: Headers;
  original: Original;
  exception: any;
}

export interface Headers {}

export interface Original {
  status: string;
  data: Data2;
}

export interface Data2 {
  feedTitle: string;
  description: string;
  owner: string;
  date: string;
  totalRecords: number;
  itemsPerPage: number;
  items: Item[];
}

export interface Item {
  titleID: number;
  primaryTitle: string;
  programType: string;
  isSeries: IsSeries;
  countryOfOrigin: any;
  director: Director;
  awards: any[];
  synopsis: string;
  credits: Credit[];
  genre: string[];
  isHD: string;
  marketRating: string;
  productionYear: string;
  languages: string | undefined[];
  mediaGroup: MediaGroup;
}

export interface IsSeries {
  id: number;
  content_id: number;
  meta_key: string;
  meta_value: string;
  created_at: string;
  updated_at: string;
}

export interface Director {
  id: number;
  content_id: number;
  meta_key: string;
  meta_value: string;
  created_at: string;
  updated_at: string;
}

export interface Credit {
  id: number;
  name: string;
}

export interface MediaGroup {
  duration: string;
  episodes: any[];
  images: Image[];
}

export interface Image {
  type: string;
  height: number;
  width: number;
  id: number;
  sourceId: number;
  contentMetaId: number;
  filename: string;
  path: string;
  isDefaultImage: string;
  isProtected: string;
}
