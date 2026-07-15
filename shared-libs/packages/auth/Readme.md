# Thư viện này sẽ hỗ trợ:

•  ✅ Đăng nhập / Đăng ký
•  ✅ Tạo và xác thực JWT
•  ✅ Refresh token
•  ✅ Middleware kiểm tra token
•  ✅ Mã hóa mật khẩu
•  ✅ Tích hợp OAuth2

# Cấu trúc thư mục thư viện `@shared-libs/auth`

shared-libs/
└── auth/
    ├── src/
    │   ├── jwt.ts               # Tạo và xác thực JWT
    │   ├── password.ts          # Mã hóa và kiểm tra mật khẩu
    │   ├── middleware.ts        # Middleware xác thực JWT
    │   ├── refresh.ts           # Xử lý refresh token
    │   ├── oauth.ts             # Tích hợp OAuth2 (Google, Facebook)
    │   └── index.ts             # Export các hàm chính
    ├── tsconfig.json
    ├── package.json
    └── README.md

