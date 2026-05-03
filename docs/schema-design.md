# Schema Design

## `Rfq`

Stores the British Auction RFQ and extension configuration.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `name` | String | RFQ display name |
| `referenceId` | String | Unique business reference |
| `bidStartAt` | DateTime | Auction opening time |
| `initialBidCloseAt` | DateTime | Original bid close time |
| `currentBidCloseAt` | DateTime | Mutable close time after extensions |
| `forcedBidCloseAt` | DateTime | Absolute latest close time |
| `pickupServiceAt` | DateTime | Pickup or service date |
| `triggerWindowMinutes` | Int | X minutes before close |
| `extensionDurationMinutes` | Int | Y minutes to extend |
| `extensionTrigger` | Enum | Bid received, any rank change, or L1 rank change |

## `Bid`

Stores supplier quote submissions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `rfqId` | String | FK to RFQ |
| `carrierName` | String | Supplier/carrier |
| `freightCharges` | Decimal | Freight component |
| `originCharges` | Decimal | Origin component |
| `destinationCharges` | Decimal | Destination component |
| `totalAmount` | Decimal | Sum used for ranking |
| `transitTimeDays` | Int | Quoted transit time |
| `quoteValidityAt` | DateTime | Quote expiry |

## `ActivityLog`

Stores auditable events for auction details.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `rfqId` | String | FK to RFQ |
| `type` | String | Event type |
| `message` | String | Human-readable log |
| `metadata` | Json | Extension reason, bid id, totals |
| `createdAt` | DateTime | Event time |
