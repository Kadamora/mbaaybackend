export interface admin {
  name: string;
  email: string;
  password: string;
  isBlocked: string;
  refreshToken: string;
  profileImage?: string;
  requests: {}[];
  orders: {}[];
  notifications: {}[];
  products: {}[];
  role: "Admin" | "Customer care" | "Super Admin";
}
