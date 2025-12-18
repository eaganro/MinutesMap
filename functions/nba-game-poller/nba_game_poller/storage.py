import gzip
import json


def upload_json_to_s3(*, s3_client, bucket, prefix, key, data, is_final=False):
    json_str = json.dumps(data)
    compressed = gzip.compress(json_str.encode("utf-8"))

    cache_control = (
        "public, max-age=604800"
        if is_final
        else "s-maxage=0, max-age=0, must-revalidate"
    )
    full_key = f"{prefix}{key}.gz"

    s3_client.put_object(
        Bucket=bucket,
        Key=full_key,
        Body=compressed,
        ContentType="application/json",
        ContentEncoding="gzip",
        CacheControl=cache_control,
    )
    print(f"Uploaded S3: {full_key}")


def update_manifest(*, s3_client, bucket, manifest_key, game_id):
    """Loads manifest.json from S3, adds game_id, uploads it back."""
    try:
        try:
            resp = s3_client.get_object(Bucket=bucket, Key=manifest_key)
            content = resp["Body"].read().decode("utf-8")
            manifest = set(json.loads(content))
        except Exception:
            manifest = set()

        if game_id in manifest:
            return

        manifest.add(game_id)
        s3_client.put_object(
            Bucket=bucket,
            Key=manifest_key,
            Body=json.dumps(list(manifest)),
            ContentType="application/json",
        )
        print(f"Manifest updated with {game_id}")
    except Exception as e:
        print(f"Manifest Error: {e}")

