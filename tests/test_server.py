# -*- coding: utf-8 -*-
"""SubscriberStore の upsert 重複制約を中心としたテスト。"""

import os
import threading
from typing import Any

import pytest

os.environ.setdefault("SUBSCRIBERS_DB_PATH", "/tmp/test_subscribers.db")

from web.server import PostgresSubscriberStore, SQLiteSubscriberStore


def _pg_dsn() -> str:
    return os.getenv("DATABASE_URL") or "postgres://postgres:password@127.0.0.1:5432/keiba_test"


def _pg_available() -> bool:
    try:
        import psycopg

        with psycopg.connect(_pg_dsn()):
            pass
    except Exception:
        return False
    return True


@pytest.fixture
def sqlite_store(tmp_path):
    path = tmp_path / "subscribers.db"
    store = SQLiteSubscriberStore(path)
    store.ensure_schema()
    return store


@pytest.fixture
def postgres_store():
    if not _pg_available():
        pytest.skip("Postgres not available")
    store = PostgresSubscriberStore(_pg_dsn())
    store.ensure_schema()
    with store._connect() as conn:
        conn.execute("DELETE FROM subscribers")
        conn.commit()
    return store


def _assert_row(store, **kwargs):
    row = store.get(customer_id=kwargs["stripe_customer_id"]) or store.get(email=kwargs["email"])
    assert row is not None
    for key, value in kwargs.items():
        assert row[key] == value


def test_upsert_new(sqlite_store):
    sqlite_store.upsert(
        stripe_customer_id="cus_1",
        email="user@example.com",
        stripe_subscription_id="sub_1",
        status="active",
        current_period_end=1,
    )
    _assert_row(
        sqlite_store,
        stripe_customer_id="cus_1",
        email="user@example.com",
        stripe_subscription_id="sub_1",
        status="active",
        current_period_end=1,
    )


def test_upsert_same_email_updates_customer_id(sqlite_store):
    sqlite_store.upsert(
        stripe_customer_id="cus_old",
        email="user@example.com",
        stripe_subscription_id="sub_1",
        status="active",
        current_period_end=1,
    )
    sqlite_store.upsert(
        stripe_customer_id="cus_new",
        email="user@example.com",
        stripe_subscription_id="sub_2",
        status="active",
        current_period_end=2,
    )
    _assert_row(
        sqlite_store,
        stripe_customer_id="cus_new",
        email="user@example.com",
        stripe_subscription_id="sub_2",
        current_period_end=2,
    )
    assert sqlite_store.get(customer_id="cus_old") is None


def test_upsert_customer_email_change(sqlite_store):
    sqlite_store.upsert(
        stripe_customer_id="cus_1",
        email="old@example.com",
        stripe_subscription_id="sub_1",
        status="active",
        current_period_end=1,
    )
    sqlite_store.upsert(
        stripe_customer_id="cus_1",
        email="new@example.com",
        stripe_subscription_id="sub_2",
        status="active",
        current_period_end=2,
    )
    assert sqlite_store.get(email="old@example.com") is None
    _assert_row(
        sqlite_store,
        stripe_customer_id="cus_1",
        email="new@example.com",
        stripe_subscription_id="sub_2",
        current_period_end=2,
    )


def test_upsert_customer_id_collision_with_existing_email(sqlite_store):
    sqlite_store.upsert(
        stripe_customer_id="cus_A",
        email="a@example.com",
        stripe_subscription_id="sub_A",
        status="active",
        current_period_end=1,
    )
    sqlite_store.upsert(
        stripe_customer_id="cus_B",
        email="b@example.com",
        stripe_subscription_id="sub_B",
        status="active",
        current_period_end=2,
    )
    sqlite_store.upsert(
        stripe_customer_id="cus_A",
        email="b@example.com",
        stripe_subscription_id="sub_A2",
        status="active",
        current_period_end=3,
    )
    assert sqlite_store.get(email="a@example.com") is None
    _assert_row(
        sqlite_store,
        stripe_customer_id="cus_A",
        email="b@example.com",
        stripe_subscription_id="sub_A2",
        current_period_end=3,
    )
    assert sqlite_store.get(customer_id="cus_B") is None


@pytest.mark.parametrize("store_fixture", ["sqlite_store", "postgres_store"])
def test_upsert_new_subscriber(request, store_fixture):
    store = request.getfixturevalue(store_fixture)
    store.upsert(
        stripe_customer_id="cus_1",
        email="user@example.com",
        stripe_subscription_id="sub_1",
        status="active",
        current_period_end=1,
    )
    _assert_row(
        store,
        stripe_customer_id="cus_1",
        email="user@example.com",
        stripe_subscription_id="sub_1",
        status="active",
        current_period_end=1,
    )


@pytest.mark.parametrize("store_fixture", ["sqlite_store", "postgres_store"])
def test_upsert_same_email_updates_customer_id_parametrized(request, store_fixture):
    store = request.getfixturevalue(store_fixture)
    store.upsert(
        stripe_customer_id="cus_old",
        email="user@example.com",
        stripe_subscription_id="sub_1",
        status="active",
        current_period_end=1,
    )
    store.upsert(
        stripe_customer_id="cus_new",
        email="user@example.com",
        stripe_subscription_id="sub_2",
        status="active",
        current_period_end=2,
    )
    _assert_row(
        store,
        stripe_customer_id="cus_new",
        email="user@example.com",
        stripe_subscription_id="sub_2",
        current_period_end=2,
    )
    assert store.get(customer_id="cus_old") is None


@pytest.mark.parametrize("store_fixture", ["sqlite_store", "postgres_store"])
def test_upsert_customer_email_change_parametrized(request, store_fixture):
    store = request.getfixturevalue(store_fixture)
    store.upsert(
        stripe_customer_id="cus_1",
        email="old@example.com",
        stripe_subscription_id="sub_1",
        status="active",
        current_period_end=1,
    )
    store.upsert(
        stripe_customer_id="cus_1",
        email="new@example.com",
        stripe_subscription_id="sub_2",
        status="active",
        current_period_end=2,
    )
    assert store.get(email="old@example.com") is None
    _assert_row(
        store,
        stripe_customer_id="cus_1",
        email="new@example.com",
        stripe_subscription_id="sub_2",
        current_period_end=2,
    )


@pytest.mark.parametrize("store_fixture", ["sqlite_store", "postgres_store"])
def test_upsert_customer_id_collision_with_existing_email_parametrized(request, store_fixture):
    store = request.getfixturevalue(store_fixture)
    store.upsert(
        stripe_customer_id="cus_A",
        email="a@example.com",
        stripe_subscription_id="sub_A",
        status="active",
        current_period_end=1,
    )
    store.upsert(
        stripe_customer_id="cus_B",
        email="b@example.com",
        stripe_subscription_id="sub_B",
        status="active",
        current_period_end=2,
    )
    store.upsert(
        stripe_customer_id="cus_A",
        email="b@example.com",
        stripe_subscription_id="sub_A2",
        status="active",
        current_period_end=3,
    )
    assert store.get(email="a@example.com") is None
    _assert_row(
        store,
        stripe_customer_id="cus_A",
        email="b@example.com",
        stripe_subscription_id="sub_A2",
        current_period_end=3,
    )
    assert store.get(customer_id="cus_B") is None


def test_postgres_upsert_concurrent_email(postgres_store):
    errors: list[tuple[int, Any]] = []

    def work(i):
        try:
            postgres_store.upsert(
                stripe_customer_id=f"cus_{i}",
                email="dup@example.com",
                stripe_subscription_id=f"sub_{i}",
                status="active",
                current_period_end=1,
            )
        except Exception as exc:
            errors.append((i, exc))

    threads = [threading.Thread(target=work, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    row = postgres_store.get(email="dup@example.com")
    assert row is not None
    assert row["email"] == "dup@example.com"


def test_postgres_upsert_concurrent_customer_id_email_change(postgres_store):
    errors: list[tuple[int, Any]] = []

    def work(i):
        try:
            postgres_store.upsert(
                stripe_customer_id="cus",
                email=f"email{i}@example.com",
                stripe_subscription_id=f"sub_{i}",
                status="active",
                current_period_end=1,
            )
        except Exception as exc:
            errors.append((i, exc))

    threads = [threading.Thread(target=work, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    row = postgres_store.get(customer_id="cus")
    assert row is not None
    assert row["stripe_customer_id"] == "cus"
