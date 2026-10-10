export default async function ConnectSuccess({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 16, fontFamily: "system-ui", textAlign: "center" }}>
      <h1 style={{ fontSize: 24 }}>Kết nối thành công ✅</h1>
      <p>
        {name ? <b>{name}</b> : "Tài khoản của bạn"} đã kết nối với hệ thống. Bạn có thể đóng trang
        này.
      </p>
    </main>
  );
}
