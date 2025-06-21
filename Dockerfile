# Dùng Nginx làm web server
FROM nginx:alpine

# Copy toàn bộ file HTML vào thư mục Nginx
COPY . /usr/share/nginx/html

# Mặc định Nginx sẽ chạy, expose cổng 80
EXPOSE 80
