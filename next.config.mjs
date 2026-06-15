const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.themealdb.com"
      },
      {
        protocol: "https",
        hostname: "www.thecocktaildb.com"
      }
    ]
  }
};

export default nextConfig;
