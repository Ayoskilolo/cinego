export interface Root {
  status: string;
  data: Category[];
}

export enum Category {
  TV = 'Tv',
  MOVIE = 'Movie',
}
