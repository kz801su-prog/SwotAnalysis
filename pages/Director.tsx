import React, { useEffect, useMemo, useState } from "react";
import Admin from "./Admin";
import Manager from "./Manager";
import { db } from "../services/storage";
import { UserProfile } from "../types";
import { Button, Card, Select } from "../components/UI";

export default function DirectorPage({ user }: { user: UserProfile }) {
  const [activeTab, setActiveTab] = useState<"director" | "manager">(
    "director",
  );
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");

  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          allUsers
            .map((u) => u.dept)
            .filter((value): value is string => !!value),
        ),
      ),
    [allUsers],
  );

  useEffect(() => {
    setAllUsers(db.getAllUsers());
  }, []);

  useEffect(() => {
    if (!selectedDept && departmentOptions.length > 0) {
      setSelectedDept(departmentOptions[0]);
    }
  }, [departmentOptions, selectedDept]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={activeTab === "director" ? "primary" : "ghost"}
          onClick={() => setActiveTab("director")}
        >
          取締役管理
        </Button>
        <Button
          variant={activeTab === "manager" ? "primary" : "ghost"}
          onClick={() => setActiveTab("manager")}
        >
          部長管理ビュー
        </Button>
      </div>

      {activeTab === "director" ? (
        <div className="space-y-4">
          <Card
            title="取締役管理"
            sub="取締役としてシステム全体の管理・分析を行います。"
          >
            <div className="text-sm text-slate-600">
              このタブでは、取締役専用の管理操作とレポート作成が行えます。
            </div>
          </Card>
          <Admin mode="director" initialTab="create" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card
            title="事業部を選択"
            sub="取締役として参照したい事業部を選択してください。"
          >
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                取締役は階層が一つ上のため、事業部単位で部長管理画面を参照できます。
              </div>
              <div className="max-w-xs">
                <Select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  options={
                    departmentOptions.length > 0
                      ? departmentOptions.map((dept) => ({
                          value: dept,
                          label: dept,
                        }))
                      : [{ value: "", label: "表示可能な事業部がありません" }]
                  }
                />
              </div>
            </div>
          </Card>
          <Manager user={user} overrideDept={selectedDept} />
        </div>
      )}
    </div>
  );
}
