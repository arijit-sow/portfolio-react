# Caching Strategies & Redis

Caching stores reusable results closer to the application so repeated reads avoid expensive work.

## Common strategies

- **Cache-aside:** the application reads the cache, then loads and populates it on a miss.
- **Write-through:** writes update the cache and backing store together.
- **Write-behind:** the cache queues writes for later persistence.

Redis supports strings, hashes, lists, sets, sorted sets, expiration, and atomic operations. Always define TTLs, invalidation rules, serialization formats, and behavior when Redis is unavailable. Cache only data that is safe to serve within its freshness requirements.
