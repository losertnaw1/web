Waypoint nên gắn trực tiếp với từng map để khi mở/map được deploy thì tất cả waypoint tương ứng có thể hiển thị và dùng ngay cho nhiệm vụ. Một cách triển khai hợp lý:

Tạo waypoint trong MapEditor

Khi bạn đang chỉnh một map (ROS hoặc vẽ tay), thêm chế độ “Waypoint” ở ngay panel công cụ: người dùng click vào canvas để thêm điểm, có thể kéo chỉnh vị trí, đặt tên/ghi chú.
Dữ liệu waypoint (tọa độ x/y theo pixel map, hoặc chuyển sang tọa độ thực tế nếu đã biết resolution) được lưu cùng SavedMap: map.waypoints = [{id, name, x, y, ...}].
Lưu cùng map

Khi handleSaveMap/deploy gọi backend, gửi kèm danh sách waypoint. Backend cập nhật JSON map (giống elements) nên mỗi map có cách waypoint riêng.
Với map ROS, dùng tọa độ pixel (theo PGM) + resolution để lúc deploy có thể chuyển sang tọa độ thế giới.
Quản lý nhiệm vụ (Task Management)

Khi tạo nhiệm vụ, trước tiên chọn map (hoặc map hiện hành).
UI tải map.waypoints và cung cấp danh sách/Autocomplete “dừng tại điểm …” – thực chất chọn waypoint id tương ứng. Có thể cho phép xem preview mini canvas (MapMiniPreview) hiển thị waypoint highlight.
Đồng bộ với ROS

Khi deploy map, backend đồng thời viết waypoint sang file riêng (JSON hoặc param server) để ROS có thể dùng.
Khi nhiệm vụ chạy thật, hệ thống nhiệm vụ lấy waypoint -> chuyển đổi sang toạ độ ROS (ở đâu, orientation default?); nếu cần orientation, mở thêm UI để nhập.
Tóm gọn:

Vị trí waypoint: tạo ngay trong MapEditor (gắn map).
Lưu: cùng JSON map (backend load/save).
Nhiệm vụ: chọn waypoint từ map khi cấu hình task.
Bạn chỉ cần bổ sung UI và save logic như trên là chu trình map → waypoint → task khớp nhau.

=> Ok vậy bổ sung giao diện thêm waypoint vào MapEditor nhỉ? Thêm 1 tab để chuyển đổi giữa "Tạo waypoint" và "Sửa map"
Tab này sẽ để sau </Grid> dòng 1611. Phần bên trên Grid này sẽ giữ nguyên khi đổi tab, còn phần bên dưới :

Khi tab là "Sửa map" thì giao diện như cũ
Khi tab là "Tạo waypoint" giao diện tạo waypoint mới bạn làm.
Trong tab "Tạo waypoint" sẽ là 1 khu vực hiển thị map (9/12), khu vực còn lại nửa bên trên sẽ để hiển thị danh sách waypoint có trên map này (3/12) và nửa bên dưới để hiển thị path trên map, Khi nhấn vào điểm bất kì mà "Free" (254) thì sẽ hiển thị giao diện "Add waypoint" sẵn thông tin vị trí x,y,z vừa click, người dùng có thể cài đặt thêm thông tin về Orientation, tên waypoint, mô tả waypoint. Sau khi nhấn lưu lại thì waypoint được hiển thị trên map, khi nhấn vào waypoint nó sẽ nổi bật ở trên map so với các waypoitn không được ấn, mỗi waypoint hiển thị trên danh sách sẽ có nút sửa và xóa , các nút tốt nhất nên để icon
Tab khác cũng nên có đó là "Add path" cũng giống như tab add waypoint, tuy nhiên sẽ có nút bấm add path (icon) để tạo path, giao diện tạo path sẽ có :
"Type" để chọn loại path (nên có loại direct và winding) , loại winding là loại path mà sẽ xác định hướng của điểm cuối ngay từ đầu, để có thể đi thẳng tới điểm cuối dễ dàng hơn tránh bị lắc lư do phải tìm hướng chính xác khi tới điểm cuối.
"Start point"
"End point"
Các header của tab cũng nên để là icon

=> Giao diện MapEditor

Thêm Tabs (icon) sau cụm <Grid> hiện tại:
• Tab 1: icon bút ⇒ “Sửa map” (giữ nguyên UI hiện có).
• Tab 2: icon marker ⇒ “Tạo waypoint”.
• Tab 3: icon route ⇒ “Add path”.
Khi đổi tab, chỉ vùng bên dưới thay đổi; phần thông tin/toolbar trên cùng giữ nguyên.
Tab “Tạo waypoint”

Layout 12 cột: 9/12 là canvas (dùng MapMiniPreview hoặc canvas riêng đọc PGM) với overlay hiển thị waypoint. 3/12 được chia đôi:
• Nửa trên: danh sách waypoint (tên, tọa độ, icon edit/delete).
• Nửa dưới: thông tin path preview (ví dụ hiển thị tuyến hiện có hoặc waypoint đang chọn).
Click vào một vị trí “Free” (giá trị 254) → mở form “Add waypoint” với pre-filled x,y (và z=0 mặc định). Form cho nhập Orientation (yaw), tên, mô tả. Lưu xong hiển thị marker trên map + thêm vào danh sách.
Tab “Add path”

Tương tự, có canvas hiển thị map + các waypoint; danh sách path; nút “Add path” (icon).
Form tạo path gồm:
• “Type”: chọn “direct” hay “winding”.
• “Start point”: chọn từ waypoint list.
• “End point”: tương tự (và nếu “winding” thì cho chọn orientation/heading hoặc intermediate control).
Khi chọn path hiển thị overlay highlight.
Dữ liệu

Map JSON (SavedMap) cần mở rộng: waypoints: [{id, name, x, y, z, orientation, description}] và paths: [{id, type, startWaypointId, endWaypointId, params…}].
Backend ROS1SavedMap cũng phải thêm trường này và ghi/đọc trong saved_maps.json.
Khi POST/GET map phải truyền kèm. Việc deploy nên export waypoint/path ra file (ví dụ YAML/JSON) để ROS dùng.
Sự kiện click trên canvas

Cần layer đọc giá trị PGM (rosImageData) để xác định pixel “Free” (254). Nếu click vào vùng khác báo lỗi.
Mỗi waypoint sẽ vẽ marker (circle/label). Khi chọn hiển thị “selected” để dễ thấy.

=> Lưu cùng file saved_maps.json
về yêu cầu orientation thì làm cách nào để phù hợp với hệ thống hiện tại là được, tránh chuyển đổi qua lại nhiều lần.
path winding sẽ cần thêm các điểm điều hướng trung gian